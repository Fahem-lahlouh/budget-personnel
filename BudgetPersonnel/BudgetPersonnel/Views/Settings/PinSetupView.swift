import SwiftUI

/// Création ou modification du code PIN.
///
/// En mode « modification », l'ancien code est demandé d'abord : sans cela,
/// quelqu'un qui trouve l'app déverrouillée pourrait changer le code à sa guise.
struct PinSetupView: View {

    enum Mode { case create, change }

    let mode: Mode
    var onFinish: (Bool) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var step: Step
    @State private var entry = ""
    @State private var firstEntry = ""
    @State private var message: String?
    @State private var isError = false

    private enum Step {
        case current, new, confirm

        var title: String {
            switch self {
            case .current: return "Code actuel"
            case .new: return "Nouveau code"
            case .confirm: return "Confirmez le code"
            }
        }

        var subtitle: String {
            switch self {
            case .current: return "Saisissez votre code actuel pour continuer."
            case .new: return "Choisissez un code à 6 chiffres."
            case .confirm: return "Saisissez-le une seconde fois."
            }
        }
    }

    init(mode: Mode, onFinish: @escaping (Bool) -> Void) {
        self.mode = mode
        self.onFinish = onFinish
        _step = State(initialValue: mode == .change ? .current : .new)
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer(minLength: 12)

                VStack(spacing: 10) {
                    Image(systemName: "key.horizontal.fill")
                        .font(.system(size: 34, weight: .light))
                        .foregroundStyle(Palette.accentGradient)

                    Text(step.title)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)

                    Text(message ?? step.subtitle)
                        .font(.subheadline)
                        .foregroundStyle(isError ? Palette.negative : Palette.textSecondary)
                        .multilineTextAlignment(.center)
                        .animation(Motion.quick, value: message)
                }

                dots.padding(.top, 30)

                Spacer(minLength: 12)

                SimplePinPad(onDigit: append, onDelete: deleteLast)
                    .padding(.bottom, 12)
            }
            .padding(.horizontal, 28)
            .background(Palette.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") {
                        onFinish(false)
                        dismiss()
                    }
                }
            }
        }
        .interactiveDismissDisabled()
    }

    private var dots: some View {
        HStack(spacing: 18) {
            ForEach(0..<6, id: \.self) { index in
                Circle()
                    .strokeBorder(isError ? Palette.negative : Palette.textTertiary, lineWidth: 1.4)
                    .background(Circle().fill(index < entry.count ? (isError ? Palette.negative : Palette.accent) : .clear))
                    .frame(width: 14, height: 14)
                    .animation(Motion.quick, value: entry.count)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(step.title)
        .accessibilityValue("\(entry.count) chiffre(s) saisi(s)")
    }

    // MARK: - Saisie

    private func append(_ digit: String) {
        guard entry.count < 6 else { return }
        Haptics.tap()
        isError = false
        message = nil
        entry.append(digit)
        if entry.count == 6 {
            let value = entry
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { advance(with: value) }
        }
    }

    private func deleteLast() {
        guard !entry.isEmpty else { return }
        Haptics.selection()
        entry.removeLast()
    }

    private func advance(with value: String) {
        switch step {
        case .current:
            if PinStore.verify(value) {
                entry = ""
                step = .new
            } else {
                fail("Code incorrect. Réessayez.")
            }

        case .new:
            firstEntry = value
            entry = ""
            step = .confirm

        case .confirm:
            guard value == firstEntry else {
                entry = ""
                firstEntry = ""
                step = .new
                fail("Les deux codes ne correspondent pas.")
                return
            }
            if PinStore.setPin(value) {
                Haptics.success()
                onFinish(true)
                dismiss()
            } else {
                fail("Impossible d'enregistrer le code dans le Trousseau.")
            }
        }
    }

    private func fail(_ text: String) {
        Haptics.error()
        entry = ""
        message = text
        isError = true
    }
}

/// Pavé numérique sans bouton biométrique, pour la configuration du code.
struct SimplePinPad: View {

    let onDigit: (String) -> Void
    let onDelete: () -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 22), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 18) {
            ForEach(1...9, id: \.self) { digit in
                key(label: "\(digit)") { onDigit("\(digit)") }
            }

            Color.clear.frame(height: 66)

            key(label: "0") { onDigit("0") }

            key(symbol: "delete.left", label: "Effacer", action: onDelete)
        }
        .frame(maxWidth: 320)
    }

    private func key(symbol: String? = nil, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                if symbol == nil {
                    Circle()
                        .fill(Palette.surface)
                        .overlay(Circle().strokeBorder(Palette.hairline, lineWidth: 0.5))
                }

                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 22))
                        .foregroundStyle(Palette.accent)
                } else {
                    Text(label)
                        .font(.system(size: 27, weight: .regular, design: .rounded))
                        .foregroundStyle(Palette.textPrimary)
                }
            }
            .frame(height: 66)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
