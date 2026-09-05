import SwiftUI
import SwiftData

/// Tableau de bord mensuel — écran d'accueil de l'app.
struct DashboardView: View {

    @Binding var selection: MonthSelection
    let settings: AppSettings
    let onAddExpense: () -> Void

    @State private var isEditingBudget = false
    @State private var isShowingYear = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: Metrics.stackSpacing) {
                    MonthDashboardContent(
                        year: selection.year,
                        month: selection.month,
                        settings: settings,
                        onAddExpense: onAddExpense,
                        onEditBudget: { isEditingBudget = true }
                    )
                    // Force la reconstruction (et donc la relance des
                    // animations de graphiques) à chaque changement de mois.
                    .id("\(selection.year)-\(selection.month)")
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
            .background(Palette.background)
            .scrollIndicators(.hidden)
            .navigationTitle(selection.label)
            .navigationBarTitleDisplayMode(.large)
            .toolbar { toolbar }
            .toolbarBackground(Palette.background, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) { MonthSwitcher(selection: $selection) }
            .simultaneousGesture(monthSwipe)
            .sheet(isPresented: $isEditingBudget) {
                MonthBudgetEditor(year: selection.year, month: selection.month)
            }
            .sheet(isPresented: $isShowingYear) {
                YearView(year: selection.year, settings: settings)
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button {
                Haptics.tap()
                isShowingYear = true
            } label: {
                Label("Vue annuelle", systemImage: "calendar")
            }
            .accessibilityLabel("Vue annuelle \(selection.year)")
        }

        ToolbarItem(placement: .topBarTrailing) {
            PrivacyToggleButton()
        }

        ToolbarItem(placement: .topBarTrailing) {
            Button {
                Haptics.tap()
                onAddExpense()
            } label: {
                Label("Ajouter", systemImage: "plus")
            }
            .accessibilityLabel("Ajouter une dépense")
        }
    }

    /// Balayage horizontal pour changer de mois.
    ///
    /// En `simultaneousGesture` : attaché en `gesture`, il prendrait le pas sur
    /// le défilement vertical de la liste.
    private var monthSwipe: some Gesture {
        DragGesture(minimumDistance: 30, coordinateSpace: .local)
            .onEnded { value in
                guard abs(value.translation.width) > abs(value.translation.height) * 1.5,
                      abs(value.translation.width) > 60 else { return }
                Haptics.selection()
                withAnimation(Motion.spring) {
                    selection.advance(by: value.translation.width < 0 ? 1 : -1)
                }
            }
    }
}

// MARK: - Sélecteur de mois

/// Barre de navigation entre les mois, posée sous le titre.
struct MonthSwitcher: View {

    @Binding var selection: MonthSelection

    var body: some View {
        HStack(spacing: 10) {
            arrow(symbol: "chevron.left", label: "Mois précédent", delta: -1)

            Spacer(minLength: 0)

            if !selection.isCurrentMonth {
                Button {
                    Haptics.selection()
                    withAnimation(Motion.spring) { selection.goToToday() }
                } label: {
                    Text("Aujourd'hui")
                        .font(.footnote.weight(.semibold))
                }
                .buttonStyle(SoftButtonStyle())
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }

            Spacer(minLength: 0)

            arrow(symbol: "chevron.right", label: "Mois suivant", delta: 1)
        }
        .animation(Motion.quick, value: selection.isCurrentMonth)
        .padding(.horizontal, Metrics.gutter)
        .padding(.bottom, 8)
        .background(Palette.background)
    }

    private func arrow(symbol: String, label: String, delta: Int) -> some View {
        Button {
            Haptics.selection()
            withAnimation(Motion.spring) { selection.advance(by: delta) }
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

// MARK: - Bouton de confidentialité

/// Ouvre / referme le second niveau de confidentialité (dépenses marquées
/// « Confidentiel »). Si aucun verrouillage n'est configuré, le bouton bascule
/// simplement l'affichage sans authentification — et le dit.
struct PrivacyToggleButton: View {

    @Environment(LockManager.self) private var lock

    var body: some View {
        Button {
            Haptics.tap()
            if lock.isConfidentialRevealed {
                lock.hideConfidential()
            } else {
                Task { await lock.revealConfidential() }
            }
        } label: {
            Image(systemName: lock.isConfidentialRevealed ? "eye.fill" : "eye.slash.fill")
        }
        .accessibilityLabel(lock.isConfidentialRevealed
            ? "Masquer les dépenses confidentielles"
            : "Afficher les dépenses confidentielles")
    }
}
