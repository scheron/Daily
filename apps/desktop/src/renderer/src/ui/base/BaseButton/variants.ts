import {defineVariant} from "@/utils/ui/tailwindcss"

// prettier-ignore
export const buttonColorVariant = defineVariant({
  baseClass: `
   relative flex items-center justify-center items-center 
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
      secondary: `
          bg-base-200 text-base-content 
          hover:bg-base-300 
          disabled:hover:bg-base-200 
      `,
      ghost: `
          bg-transparent text-base-content 
          hover:bg-base-300/80
          disabled:hover:bg-transparent
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
      outline: `
          text-base-content border border-base-content/20 
          hover:bg-base-200 hover:border-base-content/50
          disabled:hover:bg-transparent 
      `,
      dashed: `
          bg-transparent text-base-content/50 border-2 border-dashed border-base-300
          hover:text-base-content hover:border-base-content/30
          disabled:hover:text-base-content/50 disabled:hover:border-base-300
      `,
    },
  },
  defaultVariants: {
    variant: "text",
  },
})

export type ButtonColorVariant = Parameters<typeof buttonColorVariant>[0]["variant"]
