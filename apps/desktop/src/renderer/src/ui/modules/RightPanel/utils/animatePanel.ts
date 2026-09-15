export function animatePanel(node: HTMLElement, variant: "slide" | "slide-x", isOpening: boolean): Promise<Animation> {
  node.getAnimations().forEach((animation) => animation.cancel())

  const frames: Keyframe[] =
    variant === "slide" ? [{width: "0px"}, {width: node.offsetWidth + "px"}] : [{transform: "translateX(100%)"}, {transform: "translateX(0)"}]
  const timing = isOpening ? {duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)"} : {duration: 150, easing: "cubic-bezier(0.4, 0, 1, 1)"}

  return node.animate(isOpening ? frames : [frames[1], frames[0]], timing).finished
}
