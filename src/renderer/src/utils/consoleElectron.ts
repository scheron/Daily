/**
 * Console Electron Debug Utility
 * 
 * This utility extends the global console object with a console.electron() method
 * that sends log messages to the main Electron process console.
 * 
 * Usage:
 * console.electron("Debug message", { data: "some data" })
 * 
 * This is useful for debugging renderer process code from the main process console,
 * especially when DevTools are not available or when you want to see renderer logs
 * in the same console as main process logs.
 */

// Extend console object with electron method for debugging
declare global {
  interface Console {
    electron: (...args: any[]) => void
  }
}

if (typeof window !== 'undefined' && window.electronAPI) {
  console.electron = (...args: any[]) => {
    window.electronAPI.consoleElectron(...args)
  }
}

export {} 