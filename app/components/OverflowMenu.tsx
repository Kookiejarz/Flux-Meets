import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import type { Dispatch, FC, SetStateAction } from 'react'
import { useState } from 'react'
import { useRoomContext } from '~/hooks/useRoomContext'
import { Button } from './Button'
import DropdownMenu from './DropdownMenu'
import { Icon } from './Icon/Icon'
import { participantCount, ParticipantsDialog } from './ParticipantsMenu'
import { ReportBugDialog } from './ReportBugDialog'
import { SettingsDialog } from './SettingsDialog'

interface OverflowMenuProps {
	bugReportsEnabled: boolean
	mobileMode?: boolean
	captionsEnabled?: boolean
	setCaptionsEnabled?: Dispatch<SetStateAction<boolean>>
	chatOpen?: boolean
	setChatOpen?: Dispatch<SetStateAction<boolean>>
	unreadCount?: number
	roomUrl?: string
	className?: string
}

export const OverflowMenu: FC<OverflowMenuProps> = ({
	bugReportsEnabled,
	mobileMode = false,
	captionsEnabled,
	setCaptionsEnabled,
	chatOpen,
	setChatOpen,
	unreadCount = 0,
	roomUrl,
	className,
}) => {
	const {
		room: {
			otherUsers,
			identity,
			roomState: { meetingId },
		},
		dataSaverMode,
		setDataSaverMode,
		audioOnlyMode,
		setAudioOnlyMode,
		simulcastEnabled,
		userMedia: { turnCameraOff },
	} = useRoomContext()
	const [settingsMenuOpen, setSettingMenuOpen] = useState(false)
	const [bugReportMenuOpen, setBugReportMenuOpen] = useState(false)
	const [participantsMenuOpen, setParticipantsMenuOpen] = useState(false)
	return (
		<>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild>
					<Button displayType="secondary" className={className}>
						<VisuallyHidden>More options</VisuallyHidden>
						<Icon type="EllipsisVerticalIcon" />
					</Button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content sideOffset={5}>
						{/* Mobile mode: Show additional features in menu */}
						{mobileMode && setCaptionsEnabled && (
							<DropdownMenu.Item
								onSelect={() => {
									setCaptionsEnabled(!captionsEnabled)
								}}
							>
								<Icon type="chatBubbleBottomCenterText" className="mr-2" />
								{captionsEnabled ? 'Disable Captions' : 'Enable Captions'}
							</DropdownMenu.Item>
						)}
						{mobileMode && setChatOpen && (
							<DropdownMenu.Item
								onSelect={() => {
									setChatOpen(!chatOpen)
								}}
							>
								<Icon type="chatBubbleLeftRight" className="mr-2" />
								{chatOpen ? 'Close Chat' : 'Open Chat'}
								{!chatOpen && unreadCount > 0 && ` (${unreadCount})`}
							</DropdownMenu.Item>
						)}
						{mobileMode && (
							<DropdownMenu.Item
								onSelect={() => {
									setParticipantsMenuOpen(true)
								}}
							>
								<Icon type="userGroup" className="mr-2" />
								{participantCount(otherUsers.length + 1)}
							</DropdownMenu.Item>
						)}
						{mobileMode && roomUrl && (
							<DropdownMenu.Item
								onSelect={() => {
									navigator.clipboard.writeText(roomUrl)
								}}
							>
								<Icon type="ClipboardDocumentIcon" className="mr-2" />
								Copy Room Link
							</DropdownMenu.Item>
						)}
						{mobileMode && <DropdownMenu.Separator />}
						{simulcastEnabled && (
							<DropdownMenu.Item
								onSelect={() => setDataSaverMode(!dataSaverMode)}
							>
								<Icon type="WifiIcon" className="mr-2" />
								{dataSaverMode ? 'Disable Data Saver' : 'Enable Data Saver'}
							</DropdownMenu.Item>
						)}
						<DropdownMenu.Item
							onSelect={() => {
								setAudioOnlyMode(!audioOnlyMode)
								turnCameraOff()
							}}
						>
							<Icon type="PhoneIcon" className="mr-2" />
							{audioOnlyMode ? 'Disable Audio Only' : 'Enable Audio Only'}
						</DropdownMenu.Item>
						{meetingId && (
							<DropdownMenu.Item
								onSelect={() => {
									window.open(`/api/transcript/${meetingId}`, '_blank')
								}}
							>
								<Icon type="chatBubbleBottomCenterText" className="mr-2" />
								Download Transcript
							</DropdownMenu.Item>
						)}
						<DropdownMenu.Item
							onSelect={() => {
								setSettingMenuOpen(true)
							}}
						>
							<Icon type="cog" className="mr-2" />
							Settings
						</DropdownMenu.Item>
						{bugReportsEnabled && (
							<DropdownMenu.Item
								onSelect={() => {
									setBugReportMenuOpen(true)
								}}
							>
								<Icon type="bug" className="mr-2" />
								Report bug
							</DropdownMenu.Item>
						)}
						{!mobileMode && (
							<DropdownMenu.Item
								className="md:hidden"
								onSelect={() => {
									setParticipantsMenuOpen(true)
								}}
							>
								<Icon type="userGroup" className="mr-2" />
								{participantCount(otherUsers.length + 1)}
							</DropdownMenu.Item>
						)}
						<DropdownMenu.Arrow />
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
			{settingsMenuOpen && (
				<SettingsDialog open onOpenChange={setSettingMenuOpen} />
			)}
			{bugReportsEnabled && bugReportMenuOpen && (
				<ReportBugDialog onOpenChange={setBugReportMenuOpen} />
			)}
			{participantsMenuOpen && (
				<ParticipantsDialog
					otherUsers={otherUsers}
					identity={identity}
					open
					onOpenChange={setParticipantsMenuOpen}
				/>
			)}
		</>
	)
}
