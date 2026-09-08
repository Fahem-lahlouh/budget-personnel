import SwiftUI
import SwiftData

/// Onglet Analyses : les graphiques du mois affiché, plus la vue annuelle.
struct AnalyticsView: View {

    @Binding var selection: MonthSelection
    let settings: AppSettings

    @State private var scope: Scope = .month

    enum Scope: String, CaseIterable, Identifiable {
        case month, year
        var id: String { rawValue }
        var label: String { self == .month ? "Mois" : "Année" }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: Metrics.stackSpacing) {
                    switch scope {
                    case .month:
                        MonthAnalyticsContent(
                            year: selection.year,
                            month: selection.month,
                            settings: settings
                        )
                        .id("m-\(selection.year)-\(selection.month)")

                    case .year:
                        YearAnalyticsContent(year: selection.year, settings: settings)
                            .id("y-\(selection.year)")
                    }
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .background(Palette.background)
            .navigationTitle("Analyses")
            .navigationBarTitleDisplayMode(.large)
            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 10) {
                    Picker("Période", selection: $scope.animation(Motion.quick)) {
                        ForEach(Scope.allCases) { value in
                            Text(value.label).tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, Metrics.gutter)

                    if scope == .month {
                        MonthSwitcher(selection: $selection)
                    } else {
                        YearSwitcher(selection: $selection)
                    }
                }
                .padding(.top, 4)
                .background(Palette.background)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { PrivacyToggleButton() }
            }
        }
    }
}

/// Navigation d'année à année, pour la vue annuelle.
struct YearSwitcher: View {

    @Binding var selection: MonthSelection

    var body: some View {
        HStack(spacing: 14) {
            button(symbol: "chevron.left", label: "Année précédente", delta: -1)

            Text(String(selection.year))
                .font(.headline)
                .monospacedDigit()
                .foregroundStyle(Palette.textPrimary)
                .contentTransition(.numericText())
                .frame(minWidth: 70)

            button(symbol: "chevron.right", label: "Année suivante", delta: 1)
        }
        .frame(maxWidth: .infinity)
        .padding(.bottom, 8)
        .background(Palette.background)
    }

    private func button(symbol: String, label: String, delta: Int) -> some View {
        Button {
            Haptics.selection()
            withAnimation(Motion.spring) { selection.year += delta }
        } label: {
            Image(systemName: symbol)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Palette.accent)
                .frame(width: 36, height: 36)
                .background(Circle().fill(Palette.accentSoft))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
