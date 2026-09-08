import SwiftUI

/// Nature d'une dépense. Ces trois valeurs pilotent les analyses (répartition
/// Fixe / Variable / Exceptionnel), elles sont donc figées dans le code ;
/// seul leur **libellé affiché** est modifiable depuis les Réglages.
enum ExpenseType: String, Codable, CaseIterable, Identifiable {
    case fixe
    case variable
    case exceptionnelle

    var id: String { rawValue }

    /// Libellé par défaut, repris du classeur Excel d'origine.
    var defaultLabel: String {
        switch self {
        case .fixe: return "Fixe"
        case .variable: return "Variable"
        case .exceptionnelle: return "Exceptionnelle"
        }
    }

    var symbol: String {
        switch self {
        case .fixe: return "lock.circle.fill"
        case .variable: return "arrow.up.arrow.down.circle.fill"
        case .exceptionnelle: return "sparkles"
        }
    }

    var tint: Color {
        switch self {
        case .fixe: return Palette.accent
        case .variable: return Palette.dyn(light: 0x0E7C86, dark: 0x2FC6D1)
        case .exceptionnelle: return Palette.warning
        }
    }
}

/// État de règlement d'une dépense.
enum PaymentStatus: String, Codable, CaseIterable, Identifiable {
    case paye
    case aPayer

    var id: String { rawValue }

    var defaultLabel: String {
        switch self {
        case .paye: return "Payé"
        case .aPayer: return "À payer"
        }
    }

    var symbol: String {
        switch self {
        case .paye: return "checkmark.circle.fill"
        case .aPayer: return "clock.badge.exclamationmark.fill"
        }
    }

    var tint: Color {
        switch self {
        case .paye: return Palette.positive
        case .aPayer: return Palette.warning
        }
    }
}

/// Thème demandé par l'utilisateur dans les Réglages.
enum AppTheme: String, Codable, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: return "Automatique"
        case .light: return "Clair"
        case .dark: return "Sombre"
        }
    }

    var symbol: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}
