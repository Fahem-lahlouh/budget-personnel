import SwiftUI
import Combine

/// Écran de verrouillage : pavé numérique 6 chiffres + Face ID / Touch ID.
struct LockView: View {

    @Environment(LockManager.self) private var lock

    @State private var entry: String = ""
    @State private var shake: CGFloat = 0
    @State private var now = Date()

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            // Fond opaque : indispensable, il masque aussi la capture d'écran
            // faite par iOS pour le sélecteur d'applications.
            Palette.background.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer(minLength: 20)

                VStack(spacing: 14) {
                    Image(systemName: "lock.shield.fill")
                        .font(.system(size: 42, weight: .light))
                        .foregroundStyle(Palette.accentGradient)

                    Text("Budget Personnel")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)

                    Text(lock.isLockedOut ? lockoutMessage : "Saisissez votre code à 6 chiffres")
                        .font(.subheadline)
                        .foregroundStyle(lock.isLockedOut ? Palette.negative : Palette.textSecondary)
                        .multilineTextAlignment(.center)
                        .animation(Motion.quick, value: lock.isLockedOut)
                }

                PinDots(filled: entry.count, total: 6, isError: shake != 0)
                    .padding(.top, 34)
                    .offset(x: shake)

                Spacer(minLength: 20)

                PinPad(
                    biometryEnabled: lock.isBiometricsEnabled && LockManager.canUseBiometrics(),
                    onDigit: append,
                    onDelete: deleteLast,
                    onBiometrics: { Task { await lock.unlockWithBiometrics() } }
                )
                .disabled(lock.isLockedOut)
                .opacity(lock.isLockedOut ? 0.4 : 1)
                .padding(.bottom, 8)
            }
            .padding(.horizontal, 28)
        }
        .task {
            // Face ID est proposé d'emblée : c'est le chemin le plus rapide.
            if lock.isBiometricsEnabled { await lock.unlockWithBiometrics() }
        }
        .onReceive(timer) { value in
            // Rafraîchit le compte à rebours de la temporisation.
            if lock.isLockedOut { now = value }
        }
    }

    private var lockoutMessage: String {
        let seconds = Int(lock.lockoutRemaining.rounded(.up))
        return "Trop de tentatives. Réessayez dans \(max(seconds, 1)) s."
    }

    // MARK: - Saisie

    private func append(_ digit: String) {
        guard entry.count < 6, !lock.isLockedOut else { return }
        Haptics.tap()
        entry.append(digit)

        guard entry.count == 6 else { return }
        // Petit délai : le 6ᵉ point doit avoir le temps de s'afficher avant
        // que l'écran ne disparaisse (ou ne tremble).
        let submitted = entry
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
            if !lock.submit(pin: submitted) {
                entry = ""
                shakeNow()
            } else {
                entry = ""
            }
        }
    }

    private func deleteLast() {
        guard !entry.isEmpty else { return }
        Haptics.selection()
        entry.removeLast()
    }

    private func shakeNow() {
        withAnimation(.linear(duration: 0.06).repeatCount(5, autoreverses: true)) {
            shake = 9
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.36) {
            withAnimation(.linear(duration: 0.06)) { shake = 0 }
        }
    }
}

// MARK: - Points de saisie

private struct PinDots: View {

    let filled: Int
    let total: Int
    let isError: Bool

    var body: some View {
        HStack(spacing: 18) {
            ForEach(0..<total, id: \.self) { index in
                Circle()
                    .strokeBorder(
                        isError ? Palette.negative : Palette.textTertiary,
                        lineWidth: 1.4
                    )
                    .background(
                        Circle().fill(index < filled
                            ? (isError ? Palette.negative : Palette.accent)
                            : .clear)
                    )
                    .frame(width: 14, height: 14)
                    .scaleEffect(index < filled ? 1.12 : 1)
                    .animation(Motion.quick, value: filled)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Code à 6 chiffres")
        .accessibilityValue("\(filled) chiffre\(filled > 1 ? "s" : "") saisi\(filled > 1 ? "s" : "")")
    }
}

// MARK: - Pavé numérique

private struct PinPad: View {

    let biometryEnabled: Bool
    let onDigit: (String) -> Void
    let onDelete: () -> Void
    let onBiometrics: () -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 22), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 18) {
            ForEach(1...9, id: \.self) { digit in
                PadButton(label: "\(digit)") { onDigit("\(digit)") }
            }

            if biometryEnabled {
                PadButton(symbol: LockManager.biometrySymbol, accessibilityLabel: LockManager.biometryLabel, action: onBiometrics)
            } else {
                Color.clear.frame(height: 66)
            }

            PadButton(label: "0") { onDigit("0") }

            PadButton(symbol: "delete.left", accessibilityLabel: "Effacer", action: onDelete)
        }
        .frame(maxWidth: 320)
    }
}

private struct PadButton: View {

    var label: String?
    var symbol: String?
    var accessibilityLabel: String?
    let action: () -> Void

    @State private var pressed = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(symbol == nil ? Palette.surface : Color.clear)
                    .overlay {
                        if symbol == nil {
                            Circle().strokeBorder(Palette.hairline, lineWidth: 0.5)
                        }
                    }

                if let label {
                    Text(label)
                        .font(.system(size: 27, weight: .regular, design: .rounded))
                        .foregroundStyle(Palette.textPrimary)
                } else if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 22, weight: .regular))
                        .foregroundStyle(Palette.accent)
                }
            }
            .frame(height: 66)
            .scaleEffect(pressed ? 0.93 : 1)
            .animation(Motion.quick, value: pressed)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel ?? label ?? "")
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in pressed = true }
                .onEnded { _ in pressed = false }
        )
    }
}
