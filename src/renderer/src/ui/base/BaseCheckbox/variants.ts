import {defineVariant} from "@/utils/ui/tailwindcss"

import type {VariantProps} from "@/utils/ui/tailwindcss"

export const checkboxBaseVariant = defineVariant({
  baseClass: `
    relative flex items-center justify-center
    rounded-[4px] border
    outline-none focus-visible-accent
    transition-all duration-200
    disabled:pointer-events-none disabled:opacity-50
  `,
  variants: {
    size: {
      sm: "size-3",
      md: "size-4",
      lg: "size-5",
    },
  },
  defaultVariants: {
    size: "md",
  },
})

export const checkboxIconVariant = defineVariant({
  variants: {
    size: {
      sm: "size-2",
      md: "size-3",
      lg: "size-3.5",
    },
  },
  defaultVariants: {
    size: "md",
  },
})

export const checkboxColorVariant = defineVariant({
  variants: {
    variant: {
      primary: "border-accent bg-accent text-white",
      soft: "border-accent/60 bg-accent/30 text-accent",
      neutral: "border-base-content bg-base-content text-base-100",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
})

export type CheckboxColorVariant = VariantProps<typeof checkboxColorVariant>["variant"]
export type CheckboxSize = "sm" | "md" | "lg"
