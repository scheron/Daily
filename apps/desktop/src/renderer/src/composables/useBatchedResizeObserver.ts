import {toValue, watch} from "vue"
import {tryOnScopeDispose} from "@vueuse/core"

import type {MaybeRefOrGetter} from "vue"

type ResizeMeasure<T> = {read: () => T; write: (value: T) => void}

const measuresByElement = new Map<Element, Set<ResizeMeasure<unknown>>>()
let sharedObserver: ResizeObserver | null = null

/** Every caller shares one `ResizeObserver`; in each delivery all reads run before any write, so a screen of components costs one layout. */
export function useBatchedResizeObserver<T>(targets: MaybeRefOrGetter<HTMLElement | null>[], measure: ResizeMeasure<T>): void {
  const sharedMeasure = measure as unknown as ResizeMeasure<unknown>
  let observedElements: HTMLElement[] = []

  watch(
    () => targets.map((target) => toValue(target)),
    (elements) => {
      const nextElements = elements.filter((element): element is HTMLElement => element !== null)

      for (const element of observedElements) {
        if (!nextElements.includes(element)) unregister(element, sharedMeasure)
      }
      for (const element of nextElements) {
        if (!observedElements.includes(element)) register(element, sharedMeasure)
      }

      observedElements = nextElements
    },
    {immediate: true, flush: "post"},
  )

  tryOnScopeDispose(() => {
    for (const element of observedElements) unregister(element, sharedMeasure)
    observedElements = []
  })
}

function register(element: HTMLElement, measure: ResizeMeasure<unknown>) {
  const measures = measuresByElement.get(element) ?? new Set()
  measures.add(measure)
  measuresByElement.set(element, measures)

  if (!sharedObserver) sharedObserver = new ResizeObserver(handleResize)
  sharedObserver.observe(element)
}

function unregister(element: HTMLElement, measure: ResizeMeasure<unknown>) {
  const measures = measuresByElement.get(element)
  if (!measures) return

  measures.delete(measure)
  if (measures.size === 0) {
    measuresByElement.delete(element)
    sharedObserver?.unobserve(element)
  }
}

function handleResize(entries: ResizeObserverEntry[]) {
  const measures: ResizeMeasure<unknown>[] = []
  const seen = new Set<ResizeMeasure<unknown>>()

  for (const entry of entries) {
    for (const measure of measuresByElement.get(entry.target) ?? []) {
      if (seen.has(measure)) continue
      seen.add(measure)
      measures.push(measure)
    }
  }

  const values = measures.map((measure) => measure.read())
  measures.forEach((measure, index) => measure.write(values[index]))
}
