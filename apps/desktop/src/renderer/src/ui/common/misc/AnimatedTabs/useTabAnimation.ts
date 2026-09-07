import {nextTick, ref, useTemplateRef} from "vue"

const ANIM_HIDE: [Keyframe[], KeyframeAnimationOptions] = [
  [
    {maxWidth: "100px", opacity: "1", transform: "translateX(0)", visibility: "visible"},
    {maxWidth: "0", opacity: "0", transform: "translateX(-10px)", visibility: "hidden"},
  ],
  {duration: 200, easing: "ease", fill: "forwards"},
]

const ANIM_SHOW: [Keyframe[], KeyframeAnimationOptions] = [
  [
    {maxWidth: "0", opacity: "0", transform: "translateX(-10px)", visibility: "hidden"},
    {maxWidth: "100px", opacity: "1", transform: "translateX(0)", visibility: "visible"},
  ],
  {duration: 300, easing: "ease", fill: "forwards"},
]

export function useTabAnimation<T extends string>(containerRefName: string = "container") {
  const containerRef = useTemplateRef<HTMLDivElement>(containerRefName)
  const isAnimating = ref(false)

  async function animateChange(currentValue: T, newValue: T): Promise<T> {
    return new Promise(async (resolve) => {
      if (isAnimating.value) return
      if (!containerRef.value) return
      if (currentValue === newValue) return

      isAnimating.value = true

      const currentButton = containerRef.value.querySelector<HTMLButtonElement>(`[data-tab="${currentValue}"]`)
      const targetButton = containerRef.value.querySelector<HTMLButtonElement>(`[data-tab="${newValue}"]`)

      if (!currentButton || !targetButton) {
        isAnimating.value = false
        resolve(newValue)
        return
      }

      const currentLabel = currentButton.querySelector('[data-name="label"]')
      const targetLabel = targetButton.querySelector('[data-name="label"]')

      await currentLabel?.animate(...ANIM_HIDE)?.finished

      resolve(newValue)

      await nextTick()

      await targetLabel?.animate(...ANIM_SHOW)?.finished

      isAnimating.value = false
    })
  }

  return {
    containerRef,
    isAnimating,
    animateChange,
  }
}
