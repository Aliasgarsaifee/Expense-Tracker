#!/usr/bin/env node
// WCAG 2.x contrast ratio between two 6-digit hex colors.
// Usage: node contrast.mjs '#0A7A50' '#F5F0E6'
const lum = (hex) => {
  const channels = hex.replace('#', '').match(/../g)
  if (!channels || channels.length !== 3) {
    console.error(`Not a 6-digit hex color: ${hex}`)
    process.exit(1)
  }
  const [r, g, b] = channels.map((c) => {
    const v = parseInt(c, 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const [fg, bg] = process.argv.slice(2)
if (!fg || !bg) {
  console.error("usage: node contrast.mjs '#foreground' '#background'")
  process.exit(1)
}
const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
const ratio = (hi + 0.05) / (lo + 0.05)
const verdict = ratio >= 4.5 ? 'PASS — AA for normal text' : 'FAIL — below 4.5:1'
console.log(`${ratio.toFixed(2)}:1  ${verdict}`)
process.exit(ratio >= 4.5 ? 0 : 2)
