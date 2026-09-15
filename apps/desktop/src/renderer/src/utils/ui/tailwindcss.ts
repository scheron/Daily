import {computed} from "vue"
import {clsx} from "clsx"
import {twMerge} from "tailwind-merge"

import type {ClassValue} from "clsx"
import type {ComputedRef} from "vue"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type ConfigSchema = Record<string, string | Record<string, string>>

type ConfigVariants<T extends ConfigSchema> = {
  [Variant in keyof T]?: keyof T[Variant] extends string ? keyof T[Variant] | boolean : boolean
}

type Config<T extends ConfigSchema> = {
  baseClass?: string
  variants?: T
  defaultVariants?: ConfigVariants<T>
}

type Props<T> = T extends ConfigSchema ? ConfigVariants<T> & Record<string, unknown> : Record<string, unknown>

type DefineVariant<T extends ConfigSchema> = (props: Props<T>) => ComputedRef<string>

/**
 * @example
 * const labelVariant = defineVariant({
 *   baseClass: 'text-sm',
 *   variants: {
 *     color: {
 *       primary: 'bg-black text-white',
 *       secondary: 'bg-white text-black',
 *     },
 *   },
 *   defaultVariants: {
 *     color: 'primary',
 *   },
 * });
 *
 * const props = { color: 'secondary' };
 * const labelClass = labelVariant(props);
 * // -> "text-sm bg-white text-black"
 *
 * const buttonVariant = defineVariant({
 *   baseClass: 'bg-orange-500',
 *   variants: {
 *     invalid: 'text-red-200',
 *     disabled: 'text-gray-400',
 *   },
 * });
 *
 * const props = { invalid: true, disabled: false };
 * const buttonClass = buttonVariant(props);
 * // -> "bg-orange-500 text-red-200"
 */
export function defineVariant<T extends ConfigSchema>(config: Config<T>): DefineVariant<T> {
  return (props: Props<T>): ComputedRef<string> => {
    return computed(() => {
      const {baseClass, variants, defaultVariants} = config

      let result = baseClass || ""

      if (!variants) return result.trim()

      for (const key in variants) {
        const propValue = props[key]
        const variantConfig = variants[key]

        const variantClass = propValue ? resolveVariantClass(propValue, variantConfig) : resolveDefaultVariantClass(key, variants, defaultVariants)

        if (variantClass) result += ` ${variantClass}`
      }

      return cn(result.trim())
    })
  }
}

function resolveVariantClass(propValue: unknown, variantConfig?: string | Record<string, string>): string {
  if (typeof variantConfig === "string") return propValue ? variantConfig : ""
  if (typeof variantConfig === "object" && variantConfig) return variantConfig[propValue as string] ?? ""
  return ""
}

function resolveDefaultVariantClass<T extends ConfigSchema>(
  key: keyof T,
  variants?: Partial<Record<keyof T, string | Record<string, string>>>,
  defaultVariants?: ConfigVariants<T>,
): string {
  const defaultVariantValue = defaultVariants?.[key]
  if (!defaultVariantValue || !variants) return ""

  return resolveVariantClass(defaultVariantValue, variants[key])
}
