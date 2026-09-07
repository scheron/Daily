import {defineVariant} from "@/utils/ui/tailwindcss"

export type TagSize = "sm" | "md"

export const tagVariant = defineVariant({
  baseClass: `
    base-tag focus-visible-accent
    inline-flex shrink-0 items-center
    rounded-full font-medium whitespace-nowrap
    transition-all duration-200 outline-none
  `,
  variants: {
    size: {
      sm: "h-6 gap-0.5 px-2",
      md: "h-7 gap-0.5 px-3",
    },
  },
  defaultVariants: {
    size: "md",
  },
})

export const tagHashVariant = defineVariant({
  variants: {
    size: {
      sm: "text-sm",
      md: "text-base",
    },
  },
  defaultVariants: {
    size: "md",
  },
})

export const tagNameVariant = defineVariant({
  variants: {
    size: {
      sm: "text-xs",
      md: "text-sm",
    },
  },
  defaultVariants: {
    size: "md",
  },
})

export const tagRemoveVariant = defineVariant({
  variants: {
    size: {
      sm: "size-3",
      md: "size-3.5",
    },
  },
  defaultVariants: {
    size: "md",
  },
})

export const tagRemoveIconVariant = defineVariant({
  variants: {
    size: {
      sm: "size-2.5",
      md: "size-3",
    },
  },
  defaultVariants: {
    size: "md",
  },
})
