import {effectScope} from "vue"
import {tryOnScopeDispose} from "@vueuse/core"

import type {EffectScope} from "vue"

type AnyFn = (...args: any[]) => any

/**
 * With `keyGenerator`, each key gets its own shared instance whose scope stops 100ms after its last subscriber leaves (so a quick remount reuses it). Without it, there is a single shared instance, stopped as soon as its last subscriber leaves.
 */
export function createSharedComposable<Fn extends AnyFn>(composable: Fn, keyGenerator?: (...args: Parameters<Fn>) => string): Fn {
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
        }, 100)
      }
    }

    tryOnScopeDispose(dispose)

    return instance.state
  }) as Fn
}
