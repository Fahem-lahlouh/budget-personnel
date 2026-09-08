import type { ReactNode } from 'react'
import './Card.css'

interface CardProps {
  children: ReactNode
  /** Retire le rembourrage interne (listes qui gèrent le leur). */
  flush?: boolean
  className?: string
}

/** Surface de base : rayon continu, liseré discret, ombre douce en mode clair. */
export function Card({ children, flush = false, className = '' }: CardProps) {
  return <div className={`card ${flush ? 'card--flush' : ''} ${className}`}>{children}</div>
}

interface SectionHeaderProps {
  title: string
  subtitle?: string
  /** Contenu aligné à droite (montant, bouton). */
  trailing?: ReactNode
}

export function SectionHeader({ title, subtitle, trailing }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <div className="section-header__text">
        <div className="section-header__title">{title}</div>
        {subtitle ? <div className="section-header__subtitle">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="section-header__trailing">{trailing}</div> : null}
    </div>
  )
}

interface TagChipProps {
  label: string
  tone?: 'accent' | 'positive' | 'warning' | 'negative' | 'neutral'
  icon?: ReactNode
}

export function TagChip({ label, tone = 'accent', icon }: TagChipProps) {
  return (
    <span className={`tag-chip tag-chip--${tone}`}>
      {icon}
      {label}
    </span>
  )
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  message: string
  action?: ReactNode
}

/**
 * État vide. Toujours accompagné d'une porte de sortie quand une action est
 * possible : un simple « aucune donnée » laisse l'utilisateur sans recours.
 */
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <div className="empty-state__title">{title}</div>
      <p className="empty-state__message">{message}</p>
      {action}
    </div>
  )
}
