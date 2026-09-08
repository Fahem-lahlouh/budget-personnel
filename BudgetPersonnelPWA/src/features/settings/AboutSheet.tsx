import { Sheet } from '@/components/Sheet'
import { Icon } from '@/design-system/Icon'
import './Settings.css'

const BLOCKS = [
  {
    icon: 'device',
    tone: 'accent',
    title: 'Tout reste sur cet appareil',
    text: 'Les dépenses sont enregistrées dans IndexedDB, sur votre téléphone. Aucun compte, aucun serveur, aucune synchronisation, aucune télémétrie. Une fois la page chargée, l’app fonctionne sans connexion : les seules requêtes réseau concernent ses propres fichiers.',
  },
  {
    icon: 'lock',
    tone: 'positive',
    title: 'Ce que le code protège vraiment',
    text: 'Le code est stocké haché (PBKDF2-SHA256, 310 000 itérations, sel aléatoire), jamais en clair. Il protège l’affichage : il empêche quelqu’un qui prend votre téléphone d’ouvrir l’app et de lire vos montants. Ce n’est pas du chiffrement de la base : quelqu’un qui ouvrirait les outils de développement du navigateur pourrait lire les données. La vraie protection au repos, c’est le code de déverrouillage de votre iPhone.',
  },
  {
    icon: 'faceId',
    tone: 'accent',
    title: 'Face ID via WebAuthn',
    text: 'Quand vous activez le déverrouillage biométrique, l’app crée une paire de clés protégée par l’authentificateur de l’appareil, et vérifie réellement la signature à chaque déverrouillage — rien n’est simulé. La vérification a lieu dans la page, pas sur un serveur : là encore, cela protège d’un accès opportuniste, pas d’un attaquant technique.',
  },
  {
    icon: 'download',
    tone: 'warning',
    title: 'Sauvegardez régulièrement',
    text: 'Une PWA n’a pas les mêmes garanties de conservation qu’une app installée depuis l’App Store. Safari peut effacer le stockage d’un site resté longtemps inutilisé, et effacer les données de navigation emporte la base. L’export JSON des Réglages est votre filet de sécurité — faites-en un régulièrement, et avant toute réinstallation.',
  },
  {
    icon: 'alert',
    tone: 'neutral',
    title: 'Ce que l’app ne fait pas',
    text: 'Aucune connexion bancaire ni import automatique d’opérations : tous les agrégateurs bancaires sont payants. Les dépenses se saisissent à la main, comme dans le classeur d’origine. Pas de synchronisation entre appareils non plus : pour passer d’un téléphone à l’autre, utilisez l’export et l’import JSON.',
  },
] as const

/** Ce que fait l'app, ce qu'elle ne fait pas, et pourquoi. */
export function AboutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} tall title="À propos" onClose={onClose}>
      <div className="stack" style={{ paddingTop: 12 }}>
        <div className="about__header">
          <span className="about__badge">
            <Icon name="wallet" size={26} />
          </span>
          <div>
            <div className="about__name">Budget Personnel</div>
            <div className="about__version">Version 1.0 · application web installable</div>
          </div>
        </div>

        {BLOCKS.map((block) => (
          <div key={block.title} className="about__block">
            <span className={`about__icon about__icon--${block.tone}`}>
              <Icon name={block.icon} size={17} />
            </span>
            <div>
              <div className="about__title">{block.title}</div>
              <p className="about__text">{block.text}</p>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
