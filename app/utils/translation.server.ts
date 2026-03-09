import type { Env } from '~/types/Env'

/**
 * Translation Service
 * 支持多种翻译提供商：OpenAI, Gemini, Inception, Workers AI
 */

export interface TranslationResult {
	language: string
	text: string
}

function normalizeTargetLanguages(targetLanguages: string[]): string[] {
	return Array.from(
		new Set(
			targetLanguages
				.map((lang) => lang.toLowerCase().split('-')[0].trim())
				.filter(Boolean)
		)
	)
}

function extractResponsesText(result: any): string | null {
	if (typeof result?.output_text === 'string' && result.output_text.trim()) {
		return result.output_text.trim()
	}

	const output = Array.isArray(result?.output) ? result.output : []
	for (const item of output) {
		const content = Array.isArray(item?.content) ? item.content : []
		for (const part of content) {
			if (typeof part?.text === 'string' && part.text.trim()) {
				return part.text.trim()
			}
		}
	}

	return null
}

async function openAIChatTranslate(
	env: Env,
	model: string,
	text: string,
	lang: string
): Promise<
	| { ok: true; translatedText: string | null }
	| { ok: false; status: number; errorBody: string }
> {
	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env.OPENAI_API_TOKEN}`,
		},
		body: JSON.stringify({
			model,
			messages: [
				{
					role: 'system',
					content: `Translate to ${lang.toUpperCase()}. Output only the translation.`,
				},
				{
					role: 'user',
					content: text,
				},
			],
		}),
	})

	if (response.ok) {
		const result: any = await response.json()
		const translatedText = result.choices?.[0]?.message?.content?.trim() ?? null
		return { ok: true, translatedText }
	}

	const errorBody = await response.text()
	return { ok: false, status: response.status, errorBody }
}

async function openAIResponsesTranslate(
	env: Env,
	model: string,
	text: string,
	lang: string
): Promise<
	| { ok: true; translatedText: string | null }
	| { ok: false; status: number; errorBody: string }
> {
	const response = await fetch('https://api.openai.com/v1/responses', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${env.OPENAI_API_TOKEN}`,
		},
		body: JSON.stringify({
			model,
			input: [
				{
					role: 'system',
					content: [
						{
							type: 'input_text',
							text: `Translate to ${lang.toUpperCase()}. Output only the translation.`,
						},
					],
				},
				{
					role: 'user',
					content: [{ type: 'input_text', text }],
				},
			],
		}),
	})

	if (response.ok) {
		const result: any = await response.json()
		const translatedText = extractResponsesText(result)
		return { ok: true, translatedText }
	}

	const errorBody = await response.text()
	return { ok: false, status: response.status, errorBody }
}

/**
 * OpenAI Translation
 */
export async function translateWithOpenAI(
	env: Env,
	text: string,
	targetLanguages: string[]
): Promise<TranslationResult[]> {
	if (
		!env.OPENAI_API_TOKEN ||
		!env.OPENAI_TRANSLATION_MODEL ||
		env.OPENAI_TRANSLATION_MODEL.trim() === ''
	) {
		console.error('OpenAI translation not configured')
		return []
	}

	const model = env.OPENAI_TRANSLATION_MODEL
	const normalizedTargetLanguages = normalizeTargetLanguages(targetLanguages)
	const useResponsesOnly = /^gpt-5/i.test(model)

	const translatedResults = await Promise.all(
		normalizedTargetLanguages.map(
			async (lang): Promise<TranslationResult | null> => {
				try {
					if (useResponsesOnly) {
						const responsesResult = await openAIResponsesTranslate(
							env,
							model,
							text,
							lang
						)
						if (responsesResult.ok) {
							if (
								responsesResult.translatedText &&
								responsesResult.translatedText !== text
							) {
								return {
									language: lang,
									text: responsesResult.translatedText,
								}
							}
							return null
						}

						console.error(
							`OpenAI responses translation failed for ${lang}: ${responsesResult.status}. Body:`,
							responsesResult.errorBody
						)
						return null
					}

					const chatResult = await openAIChatTranslate(env, model, text, lang)

					if (chatResult.ok) {
						if (
							chatResult.translatedText &&
							chatResult.translatedText !== text
						) {
							return {
								language: lang,
								text: chatResult.translatedText,
							}
						}
						return null
					}

					if (chatResult.status === 400 || chatResult.status === 404) {
						console.warn(
							`OpenAI chat/completions failed for ${lang} (${chatResult.status}), falling back to /v1/responses. Body:`,
							chatResult.errorBody
						)

						const responsesResult = await openAIResponsesTranslate(
							env,
							model,
							text,
							lang
						)
						if (responsesResult.ok) {
							if (
								responsesResult.translatedText &&
								responsesResult.translatedText !== text
							) {
								return {
									language: lang,
									text: responsesResult.translatedText,
								}
							}
							return null
						}

						console.error(
							`OpenAI responses translation failed for ${lang}: ${responsesResult.status}. Body:`,
							responsesResult.errorBody
						)
						return null
					}

					console.error(
						`OpenAI translation failed for ${lang}: ${chatResult.status}. Body:`,
						chatResult.errorBody
					)
					return null
				} catch (e) {
					console.error(`OpenAI translation error for ${lang}:`, e)
					return null
				}
			}
		)
	)

	return translatedResults.filter(
		(item): item is TranslationResult => item !== null
	)
}

/**
 * Gemini Translation
 */
export async function translateWithGemini(
	env: Env,
	text: string,
	targetLanguages: string[]
): Promise<TranslationResult[]> {
	if (
		!env.GEMINI_API_KEY ||
		!env.GEMINI_TRANSLATION_MODEL ||
		env.GEMINI_TRANSLATION_MODEL.trim() === ''
	) {
		console.error('Gemini translation not configured')
		return []
	}

	const model = env.GEMINI_TRANSLATION_MODEL
	const apiKey = env.GEMINI_API_KEY
	const normalizedTargetLanguages = normalizeTargetLanguages(targetLanguages)

	const translatedResults = await Promise.all(
		normalizedTargetLanguages.map(
			async (lang): Promise<TranslationResult | null> => {
				try {
					const response = await fetch(
						`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
						{
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({
								contents: [
									{
										parts: [
											{
												text: `Translate to ${lang.toUpperCase()}. Output only the translation:\n\n${text}`,
											},
										],
									},
								],
								generationConfig: {
									temperature: 0.3,
									maxOutputTokens: 200,
								},
							}),
						}
					)

					if (response.ok) {
						const result: any = await response.json()
						const translatedText =
							result.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
						if (translatedText && translatedText !== text) {
							return {
								language: lang,
								text: translatedText,
							}
						}
						return null
					}

					console.error(
						`Gemini translation failed for ${lang}:`,
						response.status
					)
					return null
				} catch (e) {
					console.error(`Gemini translation error for ${lang}:`, e)
					return null
				}
			}
		)
	)

	return translatedResults.filter(
		(item): item is TranslationResult => item !== null
	)
}

/**
 * Inception Translation
 */
export async function translateWithInception(
	env: Env,
	text: string,
	targetLanguages: string[]
): Promise<TranslationResult[]> {
	if (
		!env.INCEPTION_API_KEY ||
		!env.INCEPTION_TRANSLATION_MODEL ||
		env.INCEPTION_TRANSLATION_MODEL.trim() === ''
	) {
		console.error('Inception translation not configured')
		return []
	}

	const model = env.INCEPTION_TRANSLATION_MODEL
	const apiKey = env.INCEPTION_API_KEY
	const normalizedTargetLanguages = normalizeTargetLanguages(targetLanguages)

	const translatedResults = await Promise.all(
		normalizedTargetLanguages.map(
			async (lang): Promise<TranslationResult | null> => {
				try {
					const response = await fetch(
						'https://api.inceptionlabs.ai/v1/chat/completions',
						{
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								Authorization: `Bearer ${apiKey}`,
							},
							body: JSON.stringify({
								model,
								messages: [
									{
										role: 'system',
										content: `Translate to ${lang.toUpperCase()}. Output only the translation.`,
									},
									{
										role: 'user',
										content: text,
									},
								],
								reasoning_effort: 'high',
								temperature: 0.75,
								}),
								}
								)
					if (response.ok) {
						const result: any = await response.json()
						const translatedText =
							result.choices?.[0]?.message?.content?.trim() ?? null
						if (translatedText && translatedText !== text) {
							return {
								language: lang,
								text: translatedText,
							}
						}
						return null
					}

					console.error(
						`Inception translation failed for ${lang}: ${response.status}. Body:`,
						await response.text()
					)
					return null
				} catch (e) {
					console.error(`Inception translation error for ${lang}:`, e)
					return null
				}
			}
		)
	)

	return translatedResults.filter(
		(item): item is TranslationResult => item !== null
	)
}

/**
 * Workers AI Translation
 */
export async function translateWithWorkersAI(
	env: Env,
	text: string,
	targetLanguages: string[]
): Promise<TranslationResult[]> {
	if (
		!env.AI ||
		env.ENABLE_WORKERS_AI !== 'true' ||
		!env.WORKERS_AI_TRANSLATION_MODEL ||
		env.WORKERS_AI_TRANSLATION_MODEL.trim() === ''
	) {
		console.error('Workers AI translation not configured')
		return []
	}

	const translationModel = env.WORKERS_AI_TRANSLATION_MODEL
	const normalizedTargetLanguages = normalizeTargetLanguages(targetLanguages)

	const translatedResults = await Promise.all(
		normalizedTargetLanguages.map(
			async (lang): Promise<TranslationResult | null> => {
				try {
					const translation = await env.AI.run(translationModel, {
						text: text,
						target_lang: lang,
					})

					if (
						translation?.translated_text &&
						translation.translated_text !== text
					) {
						return {
							language: lang,
							text: translation.translated_text,
						}
					}
					return null
				} catch (e) {
					console.error(`Workers AI translation error for ${lang}:`, e)
					return null
				}
			}
		)
	)

	return translatedResults.filter(
		(item): item is TranslationResult => item !== null
	)
}

/**
 * 统一翻译接口 - 根据配置自动选择翻译提供商
 */
export async function translate(
	env: Env,
	text: string,
	targetLanguages: string[]
): Promise<TranslationResult[]> {
	const translationProvider = env.TRANSLATION_PROVIDER || 'openai'

	switch (translationProvider) {
		case 'openai':
			return translateWithOpenAI(env, text, targetLanguages)
		case 'gemini':
			return translateWithGemini(env, text, targetLanguages)
		case 'workers-ai':
			return translateWithWorkersAI(env, text, targetLanguages)
		case 'inception':
			return translateWithInception(env, text, targetLanguages)
		case 'none':
			return []
		default:
			console.warn(
				`Unknown translation provider: ${translationProvider}, falling back to OpenAI`
			)
			return translateWithOpenAI(env, text, targetLanguages)
	}
}
