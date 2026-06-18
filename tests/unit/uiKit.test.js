// uiKit — design tokens object factories. Test smoke: shape coerente,
// merge opts custom, varianti btn/tab.

import { describe, it, expect } from 'vitest'
import {
  uiCard, uiCardCompact, uiLabel, uiSectionTitle,
  uiInput, uiTextarea, uiBtn,
  uiTable, uiTh, uiTd, uiTdNum,
  uiTabBar, uiTab,
  uiGap, uiPageContainer,
} from '../../src/lib/uiKit'

describe('uiCard / uiCardCompact', () => {
  it('uiCard ritorna oggetto con background+border+padding default', () => {
    const c = uiCard()
    expect(c.background).toBeDefined()
    expect(c.border).toMatch(/1px solid/)
    expect(c.padding).toBe('18px 20px')
    expect(c.borderRadius).toBeDefined()
  })

  it('uiCard opts merge: padding custom override default', () => {
    const c = uiCard({ padding: '8px 10px' })
    expect(c.padding).toBe('8px 10px')
  })

  it('uiCard opts arbitrari mergiati nello stile', () => {
    const c = uiCard({ marginTop: 20, color: 'red' })
    expect(c.marginTop).toBe(20)
    expect(c.color).toBe('red')
  })

  it('uiCardCompact ha padding ridotto', () => {
    expect(uiCardCompact().padding).toBe('12px 14px')
  })
})

describe('uiLabel / uiSectionTitle', () => {
  it('uiLabel ha fontSize + uppercase', () => {
    expect(uiLabel.fontSize).toBe(11)
    expect(uiLabel.textTransform).toBe('uppercase')
  })

  it('uiSectionTitle ha fontWeight 700+', () => {
    expect(uiSectionTitle.fontWeight).toBeGreaterThanOrEqual(700)
  })
})

describe('uiInput / uiTextarea (responsive)', () => {
  it('uiInput desktop fontSize 13', () => {
    expect(uiInput(false).fontSize).toBe(13)
  })

  it('uiInput mobile fontSize 16 (no zoom iOS)', () => {
    expect(uiInput(true).fontSize).toBe(16)
  })

  it('uiTextarea desktop vs mobile fontSize differente', () => {
    expect(uiTextarea(false).fontSize).not.toBe(uiTextarea(true).fontSize)
  })
})

describe('uiBtn (varianti)', () => {
  it('primary default', () => {
    const b = uiBtn()
    expect(b.background).toBeDefined()
    expect(b.color).toBeDefined()
    expect(b.cursor).toBe('pointer')
  })

  it('varianti supportate: primary, secondary, ghost, danger', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger']) {
      const b = uiBtn({ variant })
      expect(b).toBeDefined()
      expect(b.padding).toBeDefined()
    }
  })

  it('size sm più piccolo di md, md più piccolo di lg', () => {
    const sm = uiBtn({ size: 'sm' })
    const md = uiBtn({ size: 'md' })
    const lg = uiBtn({ size: 'lg' })
    // padding contiene N px — verifichiamo fontSize crescente.
    expect(sm.fontSize).toBeLessThan(md.fontSize)
    expect(md.fontSize).toBeLessThanOrEqual(lg.fontSize)
  })

  it('disabled=true cambia cursor + opacity', () => {
    const b = uiBtn({ disabled: true })
    expect(b.cursor).toBe('not-allowed')
    expect(b.opacity).toBeDefined()
  })

  it('fullWidth=true → width:100%', () => {
    expect(uiBtn({ fullWidth: true }).width).toBe('100%')
  })
})

describe('uiTable / uiTh / uiTd / uiTdNum', () => {
  it('uiTable width 100% + borderCollapse o separate', () => {
    expect(uiTable.width).toBe('100%')
    expect(['collapse', 'separate']).toContain(uiTable.borderCollapse)
  })

  it('uiTh uppercase letterSpacing', () => {
    expect(uiTh.textTransform).toBe('uppercase')
    expect(uiTh.letterSpacing).toBeDefined()
  })

  it('uiTdNum textAlign right + tabular-nums', () => {
    expect(uiTdNum.textAlign).toBe('right')
    expect(uiTdNum.fontVariantNumeric).toBe('tabular-nums')
  })
})

describe('uiTabBar / uiTab', () => {
  it('uiTabBar desktop ha display flex', () => {
    const tb = uiTabBar(false)
    expect(tb.display).toBe('flex')
  })

  it('uiTab(true) attivo ha colore distinto vs uiTab(false)', () => {
    const att = uiTab(true)
    const inatt = uiTab(false)
    expect(att.color).not.toBe(inatt.color)
  })

  it('uiTab attivo ha fontWeight piu alto', () => {
    const att = uiTab(true)
    const inatt = uiTab(false)
    expect(att.fontWeight).toBeGreaterThanOrEqual(inatt.fontWeight)
  })
})

describe('uiGap / uiPageContainer', () => {
  it('uiGap ha valori sm/md/lg numerici crescenti', () => {
    expect(uiGap.sm).toBeLessThan(uiGap.md)
    expect(uiGap.md).toBeLessThan(uiGap.lg)
  })

  it('uiPageContainer mobile ha padding ridotto', () => {
    const d = uiPageContainer(false)
    const m = uiPageContainer(true)
    expect(m.padding).not.toBe(d.padding)
  })
})
