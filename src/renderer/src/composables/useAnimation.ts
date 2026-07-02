type AnimationVariant = "slide" | "slide-x"

const TIMING = {
  enter: {duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)"},
  leave: {duration: 150, easing: "cubic-bezier(0.4, 0, 1, 1)"},
}

const VARIANTS: Record<AnimationVariant, (node: HTMLElement) => Keyframe[]> = {
  slide: (node) => [{width: "0px"}, {width: node.offsetWidth + "px"}],
  "slide-x": () => [{transform: "translateX(100%)"}, {transform: "translateX(0)"}],
}

/**
 * Enter/leave animation for a `<Transition :css="false" @enter @leave>`. Picks keyframes by
 * @example const {onEnter, onLeave} = useAnimation("slide")
 */
export function useAnimation(variant: AnimationVariant = "slide") {
  function onEnter(el: Element, done: () => void) {
    run(el as HTMLElement, true).then(done, done)
  }

  function onLeave(el: Element, done: () => void) {
    run(el as HTMLElement, false).then(done, done)
  }

  function run(node: HTMLElement, opening: boolean): Promise<Animation> {
    node.getAnimations().forEach((animation) => animation.cancel())
    const frames = VARIANTS[variant](node)
    return node.animate(opening ? frames : [frames[1], frames[0]], opening ? TIMING.enter : TIMING.leave).finished
  }

  return {onEnter, onLeave}
}
