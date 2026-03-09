use js_sys::{
    Array, ArrayBuffer, Object,
    Reflect::{get as obj_get, set as obj_set},
    Uint8Array,
};
use log::{Level, info};
use mls_ops::{
    WelcomePackageOut, WorkerResponse, decrypt_msg, encrypt_msg, infer_unencrypted_prefix_size,
};
use openmls::prelude::tls_codec::Serialize;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{
    ReadableStream, ReadableStreamDefaultReader, RtcEncodedAudioFrame, RtcEncodedVideoFrame,
    WritableStream, WritableStreamDefaultWriter,
};

mod mls_ops;

/// Given an `RtcEncodedAudioFrame` or `RtcEncodedVideoFrame`, returns the frame's byte contents
fn get_frame_data(frame: &JsValue) -> Option<Vec<u8>> {
    if RtcEncodedAudioFrame::instanceof(frame) {
        let frame: &RtcEncodedAudioFrame = frame.dyn_ref().unwrap();
        Some(Uint8Array::new(&frame.data()).to_vec())
    } else if RtcEncodedVideoFrame::instanceof(frame) {
        let frame: &RtcEncodedVideoFrame = frame.dyn_ref().unwrap();
        Some(Uint8Array::new(&frame.data()).to_vec())
    } else {
        // Fallback for frame-like objects where `.data` exists but constructor checks fail.
        // This can happen across worker/browser boundaries in some implementations.
        if let Ok(data) = obj_get(frame, &"data".into()) {
            if data.is_instance_of::<ArrayBuffer>() {
                return Some(Uint8Array::new(&data.unchecked_into::<ArrayBuffer>()).to_vec());
            }
        }

        None
    }
}

/// Given an `RtcEncodedAudioFrame` or `RtcEncodedVideoFrame` and a bytestring, sets frame's bytestring
fn set_frame_data(frame: &JsValue, new_data: &[u8]) -> bool {
    // Copy the new data into an ArrayBuffer
    let buf = ArrayBuffer::new(new_data.len() as u32);
    let view = Uint8Array::new(&buf);
    view.copy_from(new_data);

    if RtcEncodedAudioFrame::instanceof(frame) {
        let frame: &RtcEncodedAudioFrame = frame.dyn_ref().unwrap();
        frame.set_data(&buf);
        true
    } else if RtcEncodedVideoFrame::instanceof(frame) {
        let frame: &RtcEncodedVideoFrame = frame.dyn_ref().unwrap();
        frame.set_data(&buf);
        true
    } else {
        // Fallback for frame-like objects with writable `.data`
        if obj_set(frame, &"data".into(), &buf).is_ok() {
            return true;
        }
        false
    }
}

/// Sets some logging globals
#[wasm_bindgen]
#[allow(non_snake_case)]
pub fn initLogging() {
    console_log::init_with_level(Level::Info).unwrap();
    console_error_panic_hook::set_once();
}

/// Processes an event and returns an object that's null, i.e., no return value, or consists of
/// fields "type": str, "payload_name": str, and "payload": ArrayBuffer.
#[wasm_bindgen]
#[allow(non_snake_case)]
pub async fn processEvent(event: Object) -> JsValue {
    let ty = match obj_get(&event, &"type".into()) {
        Ok(v) => v.as_string().unwrap_or_else(|| "unknown".to_string()),
        Err(_) => "unknown".to_string(),
    };
    let ty = ty.as_str();
    info!("Received event of type {ty} from main thread");

    let ret = match ty {
        "encryptStream" | "decryptStream" => {
            let in_field: ReadableStream = match obj_get(&event, &"in".into()) {
                Ok(v) => v.dyn_into().expect("field 'in' must be a ReadableStream"),
                Err(_) => panic!("encrypt/decryptStream event expects input field 'in'"),
            };
            let out_field: WritableStream = match obj_get(&event, &"out".into()) {
                Ok(v) => v.dyn_into().expect("field 'out' must be a WritableStream"),
                Err(_) => panic!("encrypt/decryptStream event expects input field 'out'"),
            };
            let reader = ReadableStreamDefaultReader::new(&in_field).unwrap();
            let writer = out_field.get_writer().unwrap();

            if ty == "encryptStream" {
                process_stream(reader, writer, encrypt_msg).await;
            } else {
                process_stream(reader, writer, decrypt_msg).await;
            }

            None
        }

        "initialize" => {
            let user_id = obj_get(&event, &"id".into())
                .ok()
                .and_then(|v| v.as_string())
                .expect("initialize event expects input field 'id' as a string");
            Some(mls_ops::new_state(&user_id))
        }

        "initializeAndCreateGroup" => {
            let user_id = obj_get(&event, &"id".into())
                .ok()
                .and_then(|v| v.as_string())
                .expect("initializeAndCreateGroup event expects input field 'id' as a string");
            Some(mls_ops::new_state_and_start_group(&user_id))
        }

        "userJoined" => {
            let key_pkg_bytes = extract_bytes_field("userJoined", &event, "keyPkg");
            Some(mls_ops::add_user(&key_pkg_bytes))
        }

        "userLeft" => {
            let uid_to_remove = obj_get(&event, &"id".into())
                .ok()
                .and_then(|v| v.as_string())
                .unwrap_or_default();
            if !uid_to_remove.is_empty() {
                Some(mls_ops::remove_user(&uid_to_remove))
            } else {
                None
            }
        }

        "recvMlsWelcome" => {
            let welcome_bytes = extract_bytes_field("recvMlsWelcome", &event, "welcome");
            let rtree_bytes = extract_bytes_field("recvMlsWelcome", &event, "rtree");
            Some(mls_ops::join_group(&welcome_bytes, &rtree_bytes))
        }

        "recvMlsMessage" => {
            let msg_bytes = extract_bytes_field("recvMlsMessage", &event, "msg");
            let sender = obj_get(&event, &"senderId".into())
                .ok()
                .and_then(|v| v.as_string())
                .unwrap_or_else(|| "unknown".to_string());
            Some(mls_ops::handle_commit(&msg_bytes, &sender))
        }

        _ => {
            info!("Received unknown message type: {ty}");
            None
        }
    };

    // Now we have to format our response. We're gonna make a list of objects to send to the main
    // thread, and a list of the buffers in each object (we need these in order to properly transfer
    // data between threads)
    let obj_list = Array::new();
    let buffers_list = Array::new();
    if let Some(WorkerResponse {
        adds,
        remove,
        new_safety_number,
        key_pkg,
        sender_id,
    }) = ret
    {
        // The ordering of our objects is as follows: safety number, key package, (welcome, add),
        // (welcome, add), ..., remove

        // Make the safety number object if a new safety number is given
        if let Some(sn) = new_safety_number {
            let (o, buffers) = make_obj_and_save_buffers("newSafetyNumber", &[("hash", &sn)]);

            // Accumulate the object and buffers
            obj_list.push(&o);
            buffers_list.push(&buffers);
        }

        // Make the key package object if a key package is given
        if let Some(kp) = key_pkg {
            let (o, buffers) = make_obj_and_save_buffers(
                "shareKeyPackage",
                &[("keyPkg", &kp.tls_serialize_detached().unwrap())],
            );

            // Accumulate the object and buffers
            obj_list.push(&o);
            buffers_list.push(&buffers);
        }

        // Make the Welcome and Add objects
        for (wp, add) in adds {
            let WelcomePackageOut {
                welcome,
                ratchet_tree,
            } = wp;

            let (o, buffers) = make_obj_and_save_buffers(
                "sendMlsWelcome",
                &[
                    ("welcome", &welcome.to_bytes().unwrap()),
                    ("rtree", &ratchet_tree.tls_serialize_detached().unwrap()),
                ],
            );
            set_sender_id(&o, sender_id.as_ref().unwrap());

            // Accumulate the Welcome-related object and buffers
            obj_list.push(&o);
            buffers_list.push(&buffers);

            // Make the Add object
            let (o, buffers) = make_obj_and_save_buffers(
                "sendMlsMessage",
                &[("msg", &add.tls_serialize_detached().unwrap())],
            );
            set_sender_id(&o, sender_id.as_ref().unwrap());

            // Accumulate the Add-related object and buffers
            obj_list.push(&o);
            buffers_list.push(&buffers);
        }

        // Make the Remove object if sone is given
        if let Some(remove) = remove {
            // Make the Remove object
            let (o, buffers) = make_obj_and_save_buffers(
                "sendMlsMessage",
                &[("msg", &remove.tls_serialize_detached().unwrap())],
            );
            set_sender_id(&o, sender_id.as_ref().unwrap());

            // Accumulate the Remove-related object and buffers
            obj_list.push(&o);
            buffers_list.push(&buffers);
        }
    }

    // Finally, return an array [objs, payloads] for the worker JS script to go through and post to
    // the calling thread
    let ret = Array::new();
    ret.push(&obj_list);
    ret.push(&buffers_list);
    ret.dyn_into().unwrap()
}

/// Processes a posssibly infinite stream of `RtcEncodedAudio(/Video)Frame`s . Reads a frame from
/// `reader`, applies `f` to the frame data, then writes the output to `writer`.
async fn process_stream<F>(
    reader: ReadableStreamDefaultReader,
    writer: WritableStreamDefaultWriter,
    f: F,
) where
    F: Fn(&[u8], usize) -> Vec<u8>,
{
    loop {
        let promise = reader.read();

        let Ok(res) = JsFuture::from(promise).await else {
            info!("Stream read rejected, ending transform loop");
            break;
        };
        let Ok(res): Result<Object, _> = res.dyn_into() else {
            info!("Stream chunk was not an object, ending transform loop");
            break;
        };
        let done_reading = obj_get(&res, &"done".into())
            .ok()
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if done_reading {
            break;
        }

        let frame = match obj_get(&res, &"value".into()) {
            Ok(v) => v,
            Err(_) => {
                info!("Failed to get frame value from stream chunk");
                continue;
            }
        };

        let Some(frame_data) = get_frame_data(&frame) else {
            // This is expected for some control frames, just pass them through
            let promise = writer.write_with_chunk(&frame);
            if JsFuture::from(promise).await.is_err() {
                break;
            }
            continue;
        };

        let unencrypted_bytes = if RtcEncodedVideoFrame::instanceof(&frame) {
            infer_unencrypted_prefix_size(&frame_data)
        } else if RtcEncodedAudioFrame::instanceof(&frame) {
            1
        } else {
            // Fallback for frame-like objects where constructor checks fail.
            let frame_type = obj_get(&frame, &"type".into()).unwrap_or(JsValue::UNDEFINED);
            if let Some(t) = frame_type.as_string() {
                if t == "key" {
                    10
                } else if t == "delta" {
                    3
                } else {
                    1
                }
            } else {
                1
            }
        };

        let new_frame_data = f(&frame_data, unencrypted_bytes);

        if !set_frame_data(&frame, &new_frame_data) {
            info!("Skipping frame with unsupported writable data shape");
            continue;
        }

        let promise = writer.write_with_chunk(&frame);
        if JsFuture::from(promise).await.is_err() {
            info!("Stream write rejected, ending transform loop");
            break;
        }
    }
}

/// Helper function. Given an object name and named bytestrings, returns the object
/// `{ type: name, [b[0]: b[1] as ArrayBuffer for b in bytestrings] },`
/// as well as the list
/// `[b[1] as ArrayBuffer for b in bytestrings]`
fn make_obj_and_save_buffers(name: &str, named_bytestrings: &[(&str, &[u8])]) -> (Object, Array) {
    let o = Object::new();
    let buffers = Array::new();
    // Make the object { type: name, ...}
    obj_set(&o, &"type".into(), &name.into()).unwrap();

    // Make the bytestrings into JS ArrayBuffers and add them to the object and buffer list
    for (field_name, bytes) in named_bytestrings {
        let arr = {
            let buf = ArrayBuffer::new(bytes.len() as u32);
            Uint8Array::new(&buf).copy_from(bytes);
            buf
        };

        obj_set(&o, &(*field_name).into(), &arr).unwrap();
        buffers.push(&arr);
    }

    (o, buffers)
}

/// Sets the `senderId` field in the given object to the given string
fn set_sender_id(o: &Object, sender_id: &str) {
    obj_set(o, &"senderId".into(), &sender_id.into()).unwrap();
}

/// Given an object `o` with field `field` of type `ArrayBuffer`, returns `o[field]` as a `Vec<u8>`
fn extract_bytes_field(event_name: &str, o: &Object, field: &'static str) -> Vec<u8> {
    let buf: ArrayBuffer = obj_get(o, &field.into())
        .unwrap_or_else(|_| panic!("{event_name} must have field '{field}'"))
        .dyn_into()
        .unwrap_or_else(|_| panic!("{event_name} field '{field}' must be an ArrayBuffer"));
    Uint8Array::new(&buf).to_vec()
}
