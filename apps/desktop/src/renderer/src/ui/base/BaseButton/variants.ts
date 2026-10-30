import {defineVariant} from "@/utils/ui/tailwindcss"

// prettier-ignore
export const buttonColorVariant = defineVariant({
  baseClass: `
   relative flex items-center justify-center items-center gap-1
   rounded-full
   outline-none focus-visible-accent
   cursor-pointer
   border-2 border-transparent
   transition-colors duration-200
   disabled:cursor-default disabled:pointer-events-none
  `,
  variants: {
    variant: {
      primary: `
          bg-accent/20 text-accent
          hover:bg-accent/30
          disabled:hover:bg-accent/20
      `,
      "primary-ghost": `
          bg-transparent text-accent
          hover:bg-accent/10
          disabled:hover:bg-transparent
      `,
      "error-ghost": `
          bg-transparent text-error
          hover:bg-error/10
          disabled:hover:bg-transparent
      `,
      "success-ghost": `
          bg-transparent text-success
          hover:bg-success/10
          disabled:hover:bg-transparent
      `,
      "warning-ghost": `
          bg-transparent text-warning
          hover:bg-warning/10
          disabled:hover:bg-transparent
      `,
      "error-soft": `
          bg-error/10 text-error
          hover:bg-error/20
          disabled:hover:bg-error/10
      `,
      "success-soft": `
          bg-success/10 text-success
          hover:bg-success/20
          disabled:hover:bg-success/10
      `,
      "warning-soft": `
          bg-warning/10 text-warning
          hover:bg-warning/20
          disabled:hover:bg-warning/10
      `,
      soft: `
          bg-base-content/10 text-base-content/70
          hover:bg-base-content/20
          disabled:hover:bg-base-content/10
      `,
      secondary: `
          bg-base-200 text-base-content
          hover:bg-base-300
          disabled:hover:bg-base-200
      `,
      tertiary: `
          bg-base-300 text-base-content/80
          hover:bg-base-300/80
          disabled:hover:bg-base-300
      `,
      inverted: `
          bg-base-content/80 text-base-100
          hover:bg-base-content/90
          disabled:hover:bg-base-content/80
      `,
      dock: `
          dock-surface gap-2 border border-base-300/70 dark:border-base-300 duration-150
          hover:bg-base-200/60
      `,
      floating: `
          bg-base-200 text-base-content/70 border border-base-300 shadow-sm
          hover:text-base-content
      `,
      ghost: `
          bg-transparent text-base-content
          hover:bg-base-300/80
          disabled:hover:bg-transparent
      `,
      "ghost-muted": `
          bg-transparent text-base-content/70
          hover:bg-base-300/80 hover:text-base-content
          disabled:hover:bg-transparent
      `,
      "filter-primary": `
          bg-transparent text-accent/90
          hover:bg-base-300/80 hover:text-accent
          disabled:hover:bg-transparent
      `,
      "filter-muted-selected": `
          bg-base-content/10 text-base-content/70
          hover:bg-base-content/20 hover:text-base-content
          disabled:hover:bg-base-content/10
      `,
      "filter-primary-selected": `
          bg-base-content/10 text-accent/90
          hover:bg-base-content/20 hover:text-accent
          disabled:hover:bg-base-content/10
      `,
      "filter-error": `
          bg-transparent text-error
          hover:bg-base-300/80 hover:text-base-content
          disabled:hover:bg-transparent
      `,
      "filter-error-selected": `
          bg-base-content/10 text-error
          hover:bg-base-content/20
          disabled:hover:bg-base-content/10
      `,
      "filter-info": `
          bg-transparent text-info
          hover:bg-base-300/80 hover:text-base-content
          disabled:hover:bg-transparent
      `,
      "filter-info-selected": `
          bg-base-content/10 text-info
          hover:bg-base-content/20
          disabled:hover:bg-base-content/10
      `,
      "filter-success": `
          bg-transparent text-success/90
          hover:bg-base-300/80 hover:text-success
          disabled:hover:bg-transparent
      `,
      "filter-success-selected": `
          bg-base-content/10 text-success/90
          hover:bg-base-content/20 hover:text-success
          disabled:hover:bg-base-content/10
      `,
      "filter-warning": `
          bg-transparent text-warning/90
          hover:bg-base-300/80 hover:text-warning
          disabled:hover:bg-transparent
      `,
      "filter-warning-selected": `
          bg-base-content/10 text-warning/90
          hover:bg-base-content/20 hover:text-warning
          disabled:hover:bg-base-content/10
      `,
      "ghost-primary": `
          bg-transparent text-base-content
          hover:bg-accent/10 hover:text-accent
          disabled:hover:bg-transparent
      `,
      text: `
          bg-transparent text-base-content/80
          hover:text-base-content
      `,
      faint: `
          bg-transparent text-base-content/30
          hover:text-base-content/60
      `,
      inline: `
          justify-start h-auto p-0 bg-transparent text-inherit font-medium
          opacity-60 hover:opacity-100 transition-opacity
      `,
      "chip-remove": `
          h-auto p-0 -mr-0.5 border-0 bg-transparent text-inherit
          opacity-70 hover:opacity-100
      `,
      link: `
          h-auto p-0 bg-transparent text-base-content/50 underline underline-offset-2
          hover:text-base-content
      `,
      outline: `
          text-base-content border border-base-content/20
          hover:bg-base-200 hover:border-base-content/50
          disabled:hover:bg-transparent
      `,
      "error-outline": `
          text-error border border-error
          hover:bg-base-200 hover:border-base-content/50
          disabled:hover:bg-transparent
      `,
      "info-outline": `
          text-info border border-info
          hover:bg-base-200 hover:border-base-content/50
          disabled:hover:bg-transparent
      `,
      dashed: `
          bg-transparent text-base-content/50 border-2 border-dashed border-base-300
          hover:text-base-content hover:border-base-content/30
          disabled:hover:text-base-content/50 disabled:hover:border-base-300
      `,
      cell: `
          justify-start gap-2 px-2 rounded-lg text-base-content
          hover:bg-base-content/10
      `,
      "cell-muted": `
          justify-start gap-2 px-2 rounded-lg text-base-content/40
          hover:bg-base-content/10
      `,
      select: `
          justify-between gap-2 px-2 rounded-lg text-base-content border border-base-300
          hover:bg-base-300/80 hover:border-base-content/20
      `,
      swatch: `
          group size-6 p-0 rounded-md bg-transparent
          hover:bg-base-300/80 hover:scale-110 transition-transform
      `,
    },
  },
  defaultVariants: {
    variant: "text",
  },
})

export const buttonSizeVariant = defineVariant({
  variants: {
    size: {
      dock: "h-10 min-w-26 px-3",
      sm: "h-7 px-3 text-sm",
      xs: "h-6 px-1.5 text-xs",
    },
  },
  defaultVariants: {
    size: "sm",
  },
})

export const iconButtonSizeVariant = defineVariant({
  variants: {
    size: {
      dock: "size-10 p-0",
      sm: "size-7 p-0",
      xs: "size-6 p-0",
    },
  },
  defaultVariants: {
    size: "sm",
  },
})

export const buttonIconSizeVariant = defineVariant({
  variants: {
    size: {
      dock: "size-4",
      sm: "size-4",
      xs: "size-3.5",
    },
  },
  defaultVariants: {
    size: "sm",
  },
})

export type ButtonColorVariant = Parameters<typeof buttonColorVariant>[0]["variant"]
export type ButtonSize = Parameters<typeof buttonSizeVariant>[0]["size"]
