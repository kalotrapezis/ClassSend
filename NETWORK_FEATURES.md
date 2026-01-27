# ClassSend - Network Discovery & Enhanced Features

## Νέες Λειτουργίες (v3.6.0)

### 🌐 Αυτόματη Ανακάλυψη Δικτύου (Network Discovery)

Η εφαρμογή τώρα **αυτόματα ανακαλύπτει** άλλους υπολογιστές με ClassSend στο ίδιο LAN δίκτυο!

**Πώς λειτουργεί:**
- Ο server εκπέμπει την παρουσία του στο δίκτυο μέσω mDNS/Bonjour
- Όλοι οι υπολογιστές στο ίδιο LAN μπορούν να δουν τον server αυτόματα
- Live updates: Βλέπετε σε πραγματικό χρόνο ποιος μπαίνει και ποιος βγαίνει

**Πρόσβαση από άλλους υπολογιστές:**
1. Ο server ακούει στο `0.0.0.0:3000` (όλες οι network interfaces)
2. Άλλοι υπολογιστές μπορούν να συνδεθούν μέσω της IP διεύθυνσης
3. Παράδειγμα: `http://192.168.1.100:3000`

**Εύρεση της IP διεύθυνσης:**
- Κατά την εκκίνηση, ο server εμφανίζει: `Server accessible at http://192.168.x.x:3000`
- Ή τρέξτε: `ipconfig` (Windows) / `ifconfig` (Linux/Mac)

### 📁 Drag-and-Drop Αποστολή Αρχείων

Τώρα μπορείτε να σύρετε και να αφήσετε αρχεία απευθείας στο chat!

**Χρήση:**
1. Σύρετε ένα ή περισσότερα αρχεία πάνω από το chat area
2. Εμφανίζεται ένα όμορφο overlay με animation
3. Αφήστε τα αρχεία για να τα στείλετε αυτόματα
4. Υποστηρίζει πολλαπλά αρχεία ταυτόχρονα!

**Visual Feedback:**
- Μπλε overlay με εικονίδιο φακέλου
- Animations για καλύτερη εμπειρία χρήστη
- Αυτόματη απόκρυψη μετά το drop

### 🔒 Προαιρετικό TLS/HTTPS Encryption

Ενεργοποιήστε κρυπτογράφηση για ασφαλέστερη επικοινωνία!

**Ενεργοποίηση:**
1. Δεξί κλικ στο tray icon
2. Επιλέξτε "Enable TLS/HTTPS"
3. Η εφαρμογή θα κάνει restart αυτόματα
4. Ο server τώρα τρέχει σε HTTPS!

**Σημειώσεις:**
- Χρησιμοποιεί self-signed certificates (για development)
- Τα certificates αποθηκεύονται στο `~/.classsend/certs/`
- Για production, χρησιμοποιήστε έγκυρα SSL certificates

## Τεχνικές Λεπτομέρειες

### Network Discovery
- **Τεχνολογία:** mDNS (Multicast DNS) / Bonjour
- **Service Type:** `_classsend._tcp`
- **Port:** 3000 (default)
- **Broadcast Info:** Class list, teacher names, user count

### Dependencies
```json
{
  "bonjour-service": "^1.3.0",    // mDNS service discovery
  "internal-ip": "^8.0.0",         // Get local IP address
  "node-forge": "^1.3.1"           // TLS certificate generation
}
```

### Αρχιτεκτονική

**Server Side:**
- `network-discovery.js` - mDNS broadcasting & discovery
- `tls-config.js` - Certificate generation & management
- `index.js` - Main server with TLS support

**Client Side:**
- Dynamic server connection (uses `window.location.origin`)
- Drag-and-drop event handlers
- Visual overlay component

## Οδηγίες Χρήσης

### Σενάριο 1: Τοπικός Υπολογιστής
```bash
cd server
npm start
```
Ανοίγει αυτόματα το Electron app στο `http://localhost:3000`

### Σενάριο 2: LAN Network (Πολλοί Υπολογιστές)

**Στον υπολογιστή του καθηγητή:**
```bash
cd server
npm start
```
Σημειώστε την IP που εμφανίζεται: `Server accessible at http://192.168.1.100:3000`

**Στους υπολογιστές των μαθητών:**
1. Ανοίξτε browser
2. Πηγαίνετε στο `http://192.168.1.100:3000` (η IP του καθηγητή)
3. Επιλέξτε "Student" και συνδεθείτε!

### Σενάριο 3: Με TLS Encryption
```bash
# Ενεργοποιήστε TLS από το tray menu
# Ή ορίστε environment variable:
USE_TLS=true npm start
```
Πρόσβαση: `https://192.168.1.100:3000`

**Σημείωση:** Θα δείτε προειδοποίηση για το self-signed certificate - είναι φυσιολογικό!

## Testing

### Test Drag-and-Drop
1. Ανοίξτε την εφαρμογή
2. Δημιουργήστε ή μπείτε σε class
3. Σύρετε ένα αρχείο πάνω από το chat
4. Επιβεβαιώστε ότι εμφανίζεται το overlay
5. Αφήστε το αρχείο
6. Επιβεβαιώστε ότι στέλνεται

### Test Network Discovery
1. Εκκινήστε την εφαρμογή σε 2 υπολογιστές στο ίδιο LAN
2. Δημιουργήστε class στον πρώτο
3. Ελέγξτε αν ο δεύτερος υπολογιστής βλέπει τον server
4. Συνδεθείτε από τον δεύτερο υπολογιστή

### Test TLS
1. Ενεργοποιήστε TLS από το menu
2. Επιβεβαιώστε restart
3. Ελέγξτε ότι το URL είναι `https://`
4. Ελέγξτε ότι η σύνδεση λειτουργεί

## Troubleshooting

### Network Discovery δεν λειτουργεί
- Ελέγξτε ότι το firewall επιτρέπει mDNS (port 5353 UDP)
- Βεβαιωθείτε ότι είστε στο ίδιο subnet
- Δοκιμάστε να απενεργοποιήσετε προσωρινά το firewall

### Δεν μπορώ να συνδεθώ από άλλο υπολογιστή
- Ελέγξτε ότι το firewall επιτρέπει port 3000
- Βεβαιωθείτε ότι χρησιμοποιείτε τη σωστή IP
- Δοκιμάστε: `ping 192.168.x.x` για να ελέγξετε connectivity

### TLS Certificate Errors
- Είναι φυσιολογικό για self-signed certificates
- Στο browser: κάντε κλικ "Advanced" → "Proceed anyway"
- Για production: χρησιμοποιήστε Let's Encrypt ή άλλο CA

## Επόμενα Βήματα

## Επόμενα Βήματα

- [x] **Automatic Class Discovery** (Implemented: Students see classes on current server)
- [ ] **Server Discovery UI** (Future: Scan LAN for *other* ClassSend servers to connect to)
- [ ] Persistent TLS settings
- [ ] Better certificate management
- [ ] Automatic reconnection on network change
