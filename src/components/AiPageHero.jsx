// AiPageHero — intestazione delle pagine AI.
//
// Riscritta il 14/09/2026, su decisione del titolare.
//
// Prima era un pannello a parte: gradiente bordeaux-oro animato, due aloni che
// galleggiavano, griglia di puntini, titolo fino a 46px con le parole in oro
// sfumato e una pastiglia "LIVE" che pulsava. Il risultato è che le pagine AI
// sembravano un'altra applicazione dentro l'applicazione — e, detto senza giri,
// sembravano generate: il tool intorno è fatto di tessere bianche, tabelle e
// numeri incolonnati, e lì dentro si apriva un manifesto.
//
// Ora l'intestazione è quella delle pagine operative: nome della pagina, una
// riga che dice cosa fa, i numeri in linea e — se servono — i pulsanti a
// destra. Le proprietà sono rimaste le stesse, così gli undici callsite non
// cambiano: `accentText` si unisce al titolo, `statusBadge` diventa una
// pastiglia sobria, il resto si dispone come nel resto del prodotto.

import React from 'react'
import ChainBadge from './ChainBadge'
import useIsMobile from '../lib/useIsMobile'
import { color as T, typo } from '../lib/theme'

const STATO = {
  LIVE: { lbl: 'attiva', col: T.green },
  BETA: { lbl: 'in prova', col: T.amber },
}

export default function AiPageHero({
  eyebrow,
  title,
  accentText,
  subtitle,
  stats = [],
  chainOnly = false,
  statusBadge = 'LIVE',
  compact = false,
  children,
}) {
  const isMobile = useIsMobile()
  const stato = STATO[statusBadge] || null

  return (
    <div style={{
      marginBottom: isMobile ? 18 : 24,
      paddingBottom: isMobile ? 16 : 18,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: isMobile ? 12 : 20, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0, flex: '1 1 340px' }}>
          {/* L'occhiello dice a quale famiglia appartiene la pagina; la
              pastiglia dice se la funzione è attiva o in prova. Niente LED
              pulsanti: è un'informazione, non un allarme. */}
          {(eyebrow || chainOnly) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap',
              ...typo.overline, color: T.textSoft,
            }}>
              {chainOnly && <ChainBadge size={12}/>}
              {eyebrow}
              {stato && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '0 8px', height: 20, borderRadius: 999,
                  background: `${stato.col}14`, color: stato.col,
                  ...typo.small, fontWeight: 700, letterSpacing: '0.02em', textTransform: 'none',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: stato.col }}/>
                  {stato.lbl}
                </span>
              )}
            </div>
          )}

          <h1 style={{
            margin: 0,
            ...(compact ? typo.h2 : typo.h1),
            color: T.text,
          }}>
            {title}{accentText ? ` ${accentText}` : ''}
          </h1>

          {subtitle && (
            <p style={{
              margin: '6px 0 0', maxWidth: 680,
              ...typo.h3, fontWeight: 500, lineHeight: 1.5, color: T.textSoft,
            }}>
              {subtitle}
            </p>
          )}
        </div>

        {children && <div style={{ flexShrink: 0 }}>{children}</div>}
      </div>

      {/* I numeri in linea, come nelle altre pagine: valore e sotto
          l'etichetta, incolonnati fra loro. */}
      {stats.length > 0 && (
        <div style={{
          display: 'flex', gap: isMobile ? 20 : 32, marginTop: 14, flexWrap: 'wrap',
        }}>
          {stats.map((s, i) => (
            <div key={i}>
              <div style={{
                ...typo.h2, fontWeight: 800, color: T.text,
                letterSpacing: '-0.02em', lineHeight: 1.2,
                fontVariantNumeric: 'tabular-nums', fontFeatureSettings: "'tnum'",
              }}>{s.n}</div>
              <div style={{
                ...typo.overline, fontWeight: 600, color: T.textSoft, marginTop: 2,
              }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
