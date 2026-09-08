import Foundation
import Security
import CryptoKit

/// Stockage du code PIN dans le Trousseau iOS.
///
/// Ce que fait réellement ce code, sans enjoliver :
/// - le PIN n'est **jamais** stocké en clair : on enregistre un SHA-256 du PIN
///   concaténé à un « sel » aléatoire de 32 octets, lui aussi dans le Trousseau ;
/// - l'article est marqué `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` : il ne
///   quitte pas l'appareil, ne part pas dans une sauvegarde iCloud/iTunes, et
///   n'est lisible que quand l'iPhone est déverrouillé ;
/// - la comparaison se fait en temps constant, pour ne pas fuir d'information
///   par le temps de réponse.
///
/// Limite honnête : le PIN protège l'**affichage** dans l'app. Les dépenses
/// elles-mêmes sont dans la base SwiftData, protégée par le chiffrement du
/// système (Data Protection) — c'est-à-dire par le code de déverrouillage de
/// l'iPhone, pas par ce PIN. Ce n'est donc pas un coffre-fort chiffré séparé,
/// c'est un écran de confidentialité solide.
enum PinStore {

    private static let service = "com.budgetpersonnel.pin"
    private static let hashAccount = "pin-hash"
    private static let saltAccount = "pin-salt"

    // MARK: - API

    static var hasPin: Bool {
        read(account: hashAccount) != nil
    }

    /// Définit ou remplace le code PIN.
    @discardableResult
    static func setPin(_ pin: String) -> Bool {
        var salt = Data(count: 32)
        let generated = salt.withUnsafeMutableBytes { buffer -> Int32 in
            guard let base = buffer.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, 32, base)
        }
        guard generated == errSecSuccess else { return false }

        let digest = hash(pin: pin, salt: salt)
        return write(digest, account: hashAccount) && write(salt, account: saltAccount)
    }

    /// Vérifie un code saisi.
    static func verify(_ pin: String) -> Bool {
        guard let stored = read(account: hashAccount), let salt = read(account: saltAccount) else {
            return false
        }
        return constantTimeEquals(hash(pin: pin, salt: salt), stored)
    }

    /// Supprime le PIN (désactivation du verrouillage).
    static func removePin() {
        delete(account: hashAccount)
        delete(account: saltAccount)
    }

    // MARK: - Hachage

    private static func hash(pin: String, salt: Data) -> Data {
        var input = salt
        input.append(Data(pin.utf8))
        return Data(SHA256.hash(data: input))
    }

    private static func constantTimeEquals(_ lhs: Data, _ rhs: Data) -> Bool {
        guard lhs.count == rhs.count else { return false }
        var difference: UInt8 = 0
        for (a, b) in zip(lhs, rhs) {
            difference |= a ^ b
        }
        return difference == 0
    }

    // MARK: - Trousseau

    private static func baseQuery(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    private static func write(_ data: Data, account: String) -> Bool {
        var query = baseQuery(account: account)
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    private static func read(account: String) -> Data? {
        var query = baseQuery(account: account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    private static func delete(account: String) {
        SecItemDelete(baseQuery(account: account) as CFDictionary)
    }
}
