import type { LinkProps } from '@remix-run/react'
import { Link } from '@remix-run/react'
import React, { forwardRef } from 'react'
import { cn } from '~/utils/style'

const displayTypeMap = {
	primary: [
		'text-white',
		'bg-orange-500 hover:bg-orange-600 active:bg-orange-700',
	],
	secondary: [
		'text-zinc-900 dark:text-zinc-100',
		'bg-zinc-200/80 hover:bg-zinc-300/80 dark:bg-zinc-700/80 dark:hover:bg-zinc-600/80 active:bg-zinc-400/80 dark:active:bg-zinc-500/80',
		'backdrop-blur-md',
	],
	ghost: [
		'text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white',
		'bg-transparent hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50',
	],
	danger: ['text-white', 'bg-red-500 hover:bg-red-600 active:bg-red-700'],
}

export type ButtonProps = Omit<React.JSX.IntrinsicElements['button'], 'ref'> & {
	displayType?: keyof typeof displayTypeMap
}

const baseStyles = [
	'inline-flex',
	'items-center',
	'justify-center',
	'gap-2',
	'rounded-full',
	'font-medium',
	'transition-all',
	'duration-200',
	'px-4',
	'py-3',
]

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, displayType = 'primary', disabled, onClick, ...rest }, ref) => (
		<button
			className={cn(
				baseStyles,
				disabled && 'cursor-not-allowed opacity-60',
				displayTypeMap[displayType as keyof typeof displayTypeMap],
				className
			)}
			aria-disabled={disabled}
			onClick={disabled ? (e) => e.preventDefault() : onClick}
			{...rest}
			ref={ref}
		/>
	)
)

Button.displayName = 'Button'

export const ButtonLink = forwardRef<
	HTMLAnchorElement,
	LinkProps & {
		displayType?: keyof typeof displayTypeMap
	}
>(({ className, displayType = 'primary', ...rest }, ref) => (
	// eslint-disable-next-line jsx-a11y/anchor-has-content
	<Link
		className={cn(
			baseStyles,
			displayTypeMap[displayType as keyof typeof displayTypeMap],
			className
		)}
		{...rest}
		ref={ref}
	/>
))

ButtonLink.displayName = 'Button'
