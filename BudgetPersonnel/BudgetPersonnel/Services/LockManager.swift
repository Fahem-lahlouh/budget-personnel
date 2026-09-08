import Foundation
import LocalAuthentication
import SwiftUI
import Observation

/// Pilote l'état de confidentialité de l'app.
///
/// Deux niveaux, indépendants :
/// 1. **Verrouillage global** — tant que l'app est verrouillée, tous les
///    montants s'affichent masqués et l'écran de saisie du PIN recouvre l'app.
/// 2. **Dépenses confidentielles** — les lignes marquées « Confidentiel »
///    restent masquées après le déverrouillage global, jusqu'à une
///    authentification dédiée valable le temps de la session.
@Observable
@MainActor
final class LockManager {

    /// L'app est verrouillée (aucun montant lisible).
    private(set) var isLocked: Bool = false

    /// Les dépenses confidentielles sont temporairement révélées.
    private(set) var isConfidentialRevealed: Bool = false

    /// Nombre d'échecs consécutifs sur le pavé numérique.
    private(set) var failedAttempts: Int = 0

    /// Verrouillage temporaire après trop d'échecs.
    private(set) var lockedOutUntil: Date?

    /// Reflète les réglages ; mis à jour par `RootView` au démarrage.
    var isLockEnabled: Bool = false
    var isBiometricsEnabled: Bool = false
    var requiresSecondUnlockForConfidential: Bool = true

    private let pinLength = 6

    // MARK: - Cycle de vie

    /// Applique l'état de départ au lancement : l'app démarre verrouillée si un
    /// code est configuré.
    func bootstrap(settings: AppSettings) {
        apply(settings: settings)
        isLocked = isLockEnabled
    }

    /// Reprend les réglages **sans** verrouiller.
    ///
    /// Appelé depuis l'écran Réglages : activer le verrouillage ne doit pas
    /// mettre l'écran de code par-dessus les Réglages que l'on est en train
    /// d'utiliser. Le verrouillage prendra effet au prochain passage en
    /// arrière-plan, comme pour n'importe quel changement de ce genre.
    func apply(settings: AppSettings) {
        isLockEnabled = settings.isLockEnabled && PinStore.hasPin
        isBiometricsEnabled = settings.isBiometricsEnabled
        requiresSecondUnlockForConfidential = settings.requiresSecondUnlockForConfidential

        // Le second niveau suit immédiatement le réglage : désactivé, tout est
        // visible ; réactivé, on referme ce qui avait été révélé.
        isConfidentialRevealed = !requiresSecondUnlockForConfidential

        // Plus de code configuré : plus rien à déverrouiller.
        if !isLockEnabled { isLocked = false }
    }

    /// Appelé quand l'app repasse en arrière-plan : on re-verrouille tout, et on
    /// referme systématiquement le second niveau.
    func lock() {
        isConfidentialRevealed = !requiresSecondUnlockForConfidential
        guard isLockEnabled else { return }
        isLocked = true
    }

    // MARK: - Déverrouillage

    var isLockedOut: Bool {
        guard let lockedOutUntil else { return false }
        return lockedOutUntil > Date()
    }

    var lockoutRemaining: TimeInterval {
        guard let lockedOutUntil else { return 0 }
        return max(0, lockedOutUntil.timeIntervalSinceNow)
    }

    /// Vérifie un PIN saisi au pavé numérique.
    @discardableResult
    func submit(pin: String) -> Bool {
        guard !isLockedOut else { return false }

        if PinStore.verify(pin) {
            failedAttempts = 0
            lockedOutUntil = nil
            withAnimation(Motion.spring) {
                isLocked = false
                if !requiresSecondUnlockForConfidential {
                    isConfidentialRevealed = true
                }
            }
            Haptics.success()
            return true
        }

        failedAttempts += 1
        Haptics.error()
        // Temporisation progressive : 5 essais ratés → 30 s, puis 60 s, 120 s…
        if failedAttempts % 5 == 0 {
            let step = failedAttempts / 5
            lockedOutUntil = Date().addingTimeInterval(min(300, 30 * pow(2, Double(step - 1))))
        }
        return false
    }

    /// Tentative de déverrouillage global par Face ID / Touch ID.
    func unlockWithBiometrics() async -> Bool {
        guard isBiometricsEnabled, !isLockedOut else { return false }
        let success = await authenticate(reason: "Déverrouiller Budget Personnel")
        if success {
            failedAttempts = 0
            lockedOutUntil = nil
            withAnimation(Motion.spring) {
                isLocked = false
                if !requiresSecondUnlockForConfidential {
                    isConfidentialRevealed = true
                }
            }
            Haptics.success()
        }
        return success
    }

    /// Second niveau : révéler les dépenses marquées confidentielles.
    func revealConfidential() async -> Bool {
        guard requiresSecondUnlockForConfidential else {
            withAnimation(Motion.spring) { isConfidentialRevealed = true }
            return true
        }

        // Aucune authentification possible sur l'appareil (ni biométrie, ni code
        // de déverrouillage configuré) : exiger une preuve d'identité
        // enfermerait l'utilisateur dehors sans rien protéger de plus. On révèle,
        // le réglage restant le seul garde-fou.
        guard Self.canAuthenticate() else {
            withAnimation(Motion.spring) { isConfidentialRevealed = true }
            return true
        }

        // Face ID si disponible, sinon le code de l'appareil : dans les deux cas
        // c'est le système qui authentifie, l'app ne voit jamais le secret.
        let success = await authenticate(reason: "Afficher les dépenses confidentielles")
        if success {
            withAnimation(Motion.spring) { isConfidentialRevealed = true }
            Haptics.success()
        }
        return success
    }

    func hideConfidential() {
        withAnimation(Motion.spring) { isConfidentialRevealed = false }
    }

    // MARK: - Biométrie

    /// Type de biométrie disponible sur l'appareil, ou `nil` s'il n'y en a pas.
    static var availableBiometry: LABiometryType? {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil) else {
            return nil
        }
        return context.biometryType == .none ? nil : context.biometryType
    }

    static var biometryLabel: String {
        switch availableBiometry {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "Biométrie"
        }
    }

    static var biometrySymbol: String {
        switch availableBiometry {
        case .faceID, .opticID: return "faceid"
        case .touchID: return "touchid"
        default: return "lock.fill"
        }
    }

    /// `deviceOwnerAuthentication` : biométrie **avec repli** sur le code de
    /// l'appareil, pour ne jamais enfermer l'utilisateur dehors.
    private func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Annuler"
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return false }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }

    /// Vérifie que la biométrie est utilisable avant de l'activer dans les
    /// Réglages (sinon on activerait un réglage qui ne fait rien).
    static func canUseBiometrics() -> Bool {
        availableBiometry != nil
    }

    /// L'appareil sait-il authentifier son propriétaire, d'une façon ou d'une
    /// autre (biométrie ou code de déverrouillage) ?
    static func canAuthenticate() -> Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }
}
