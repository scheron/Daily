import {effectScope} from "vue"
import {tryOnScopeDispose} from "@vueuse/core"

import type {EffectScope} from "vue"

type AnyFn = (...args: any[]) => any
/**
 * Create a shared composable function that can be used to share a state between multiple components
 * @extends https://vueuse.org/shared/createSharedComposable/#createsharedcomposable
 *
 * @param composable - The composable function to share
 * @param keyGenerator - Function to generate unique key from parameters
 * @param options - Additional options
 */
export function createSharedComposable<Fn extends AnyFn>(
  composable: Fn,
  keyGenerator?: (...args: Parameters<Fn>) => string,
  options: {
    /**
     * Delay before disposing the scope when no subscribers
     * Prevents flicker on quick remount
     * @default 100
     */
    disposeDelay?: number
  } = {},
): Fn {
  const {disposeDelay = 100} = options

  // If no keyGenerator, use original VueUse behavior
  if (!keyGenerator) {
    let subscribers = 0
    let state: ReturnType<Fn> | undefined
    let scope: EffectScope | undefined

    function dispose() {
      subscribers -= 1
      if (scope && subscribers <= 0) {
        scope.stop()
        state = undefined
        scope = undefined
      }
    }

    return ((...args: Parameters<Fn>) => {
      subscribers += 1
      if (!scope) {
        scope = effectScope(true)
        state = scope.run(() => composable(...args))
      }

      tryOnScopeDispose(dispose)
      return state
    }) as Fn
  }

  // With parameters - we need a Map for different instances
  const instances = new Map<
    string,
    {
      state: ReturnType<Fn>
      scope: EffectScope
      subscribers: number
      disposeTimer?: ReturnType<typeof setTimeout>
    }
  >()

  return ((...args: Parameters<Fn>) => {
    const key = keyGenerator(...args)

    if (!instances.has(key)) {
      const scope = effectScope(true)
      const state = scope.run(() => composable(...args))!

      instances.set(key, {
        state,
        scope,
        subscribers: 0,
      })
    }

    const instance = instances.get(key)!
    instance.subscribers += 1

    if (instance.disposeTimer) {
      clearTimeout(instance.disposeTimer)
      instance.disposeTimer = undefined
    }

    function dispose() {
      instance.subscribers -= 1

      if (instance.subscribers <= 0) {
        instance.disposeTimer = setTimeout(() => {
          if (instance.subscribers <= 0) {
            instance.scope.stop()
            instances.delete(key)
          }
        }, disposeDelay)
      }
    }

    tryOnScopeDispose(dispose)

    return instance.state
  }) as Fn
}
