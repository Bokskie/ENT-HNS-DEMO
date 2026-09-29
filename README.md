# ENT Endoscopy System

A comprehensive medical reporting system for ENT (Ear, Nose, Throat) endoscopy procedures and PhilHealth CF4 claim forms.

## 📁 Project Structure

```
ENT-Endoscopy-report/
├── index.html              # Main menu / Dashboard
├── login.html              # Sign-in screen (doctors, secretaries, admin)
├── admin.html              # Admin console (users, live sessions, activity log)
├── nasalEndoscopy.html     # Nasal Endoscopy Report Form
├── laryngealEndoscopy.html # Laryngeal Endoscopy Report Form
├── cf4Form.html            # PhilHealth CF4 Claim Form
├── settings.html           # Application Settings (Endoscopy + CF4)
├── manifest.json           # PWA Manifest
├── sw.js                   # Service Worker (Offline support)
├── supabase_schema.sql     # Base cloud schema (records + shared settings)
├── supabase_auth_schema.sql# Upgrade schema: doctor scoping, users, sessions, activity log
│
├── function/               # JavaScript Logic
│   ├── index.js            # Main application logic (all pages)
│   ├── cf4.js              # CF4 form specific logic
│   ├── auth.js             # Login, session, roles, header user chip (window.EntAuth)
│   ├── admin.js            # Admin console logic (window: admin.html)
│   ├── supabaseClient.js   # Supabase REST helper (window.EntSupabase)
│   ├── syncEngine.js       # Background record sync, now doctor-scoped
│   ├── patientRecords.js   # Local activity history (shared devices)
│   ├── dbRecords.js        # "Save to Database" + cloud record browser
│   └── draftsBrowser.js    # Local draft files browser
│
├── js/lib/                 # Local library copies (work fully offline)
│   ├── jspdf.umd.min.js    # jsPDF 2.5.1 (PDF generation)
│   ├── html2canvas.min.js  # html2canvas 1.4.1 (PDF rendering)
│   ├── cropper.min.js      # Cropper.js 1.6.2 (image cropping)
│   ├── pdf.min.js          # PDF.js 3.11.174 (PDF text extraction)
│   └── pdf.worker.min.js   # PDF.js worker (offline)
│
├── css/lib/                # Local stylesheet copies
│   └── cropper.min.css     # Cropper.js styles
│
├── style/                  # Stylesheets
│   ├── index.css           # Main stylesheet (all pages)
│   ├── auth.css            # Login screen, user chip, admin console
│   └── cf4.css             # CF4 form specific styles
│
├── image/                  # Images & Logos
│   ├── ent-logo.webp       # ENT logo
│   ├── rmci-logo.png       # RMCI logo
│   ├── cumc-logo.png       # CUMC logo
│   └── philhealth-logo.webp # PhilHealth logo
│
├── docs/                   # Reference Documents
│   ├── CF4_CF4_Form.pdf    # CF4 Form reference
│   └── WAFO_CF4_Form.pdf   # WAFO CF4 Form reference
│
└── README.md               # This file
```

## 🚀 Features

### Endoscopy Reports
- **Nasal Endoscopy** - Create detailed nasal endoscopy reports
- **Laryngeal Endoscopy** - Create detailed laryngeal endoscopy reports
- Image attachment with cropping and video-to-image capture
- Auto-generated impressions and recommendations
- Editable PDF export (text-based, not image-based)
- **Save Draft** - Saves the whole report (fields + images) as a JSON draft file so you can continue editing later
- **Open Draft** - Restores a saved draft file so you can keep editing a report
- **New Form** - One click starts a blank form of the same type for the next patient (current entries are cleared, undo supported)
- Native print support
- Auto-save to localStorage

### CF4 Form
- PhilHealth CF4 Claim Form (February 2020 version)
- Auto-fill HCI information from settings
- Checkbox grids for symptoms and physical examination
- Editable PDF export
- Print support
- **New Form** - Prepares a blank CF4 form for the next patient (Doctor's Order/Action template auto-restored)

### Settings
- **Endoscopy Settings** - Clinic info, header styling, logos, procedure templates, physician lists
- **CF4 Form Settings** - HCI defaults for the CF4 form
- Dark mode support
- **Full offline capability (PWA)** - All pages, PDF generation, image cropping, and PDF.js run from local copies, so the system works with NO internet connection. Open the app once while online so the service worker caches the files, then it works offline anywhere.

## 🔐 Users, Roles & Admin Console

Every page (except `login.html`) requires a sign-in. The signed-in user decides **which
cloud records are visible and who owns a newly saved report**, so several doctors can
use the same clinic workspace without seeing each other's patients.

| Role | Signs in with | Sees in the cloud | Can open |
| --- | --- | --- | --- |
| **Doctor** | own username | only rows stamped with his/her `doctor_id` | report forms |
| **Secretary** | own username | rows of the **assigned doctor** only | report forms |
| **Admin** | `admin` | **every** row of the clinic | report forms + `admin.html` |

A header chip (injected by `function/auth.js`) always shows who is signed in and whose
records are being viewed, with a **Sign out** button (and an **Admin** link for admins).

### Default accounts (seeded by `supabase_auth_schema.sql`)

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `admin123` | Admin |
| `doc1` … `doc4` | `doctor123` | Doctor |
| `sec1` … `sec4` | `secretary123` | Secretary (`sec1`→`doc1`, `sec2`→`doc2`, `sec3`→`doc3`, `sec4`→`doc4`) |

> Change these from **Admin → Users** before the first real patient. Passwords are
> stored as `SHA-256(salt || password)` with a per-user salt, never as plain text.
> Every account the admin creates (or resets) is flagged `must_change_password`, so the
> **next online sign-in forces the user to pick their own password** on the sign-in
> screen before the app opens. Offline sign-in stays available with the old password,
> because a new hash cannot be pushed to the database without a connection.

### Enabling it on an existing project

1. Open the Supabase **SQL Editor** and run `supabase_auth_schema.sql` (it is idempotent
   and safe to run on a database that already contains `patient_records`):
   - adds `doctor_id` / `created_by` columns to `patient_records`,
   - swaps the unique key from `(clinic_id, record_key)` to
     `(clinic_id, doctor_id, record_key)` so two doctors can treat the same patient,
   - creates `clinic_users`, `user_sessions`, `activity_logs`,
   - seeds the accounts above.
2. Deploy the updated files. The service worker cache version was bumped
   (`sw.js` → `ent-report-system-v27-auth`), so open the app once while online and tap
   **Update Now** on the update toast; each device then works offline again.
3. Sign in, open **Admin → Users**, rename the placeholder doctors/secretaries and set
   real passwords. Secretaries must be assigned to a doctor (enforced by a CHECK
   constraint as well as in the UI).

### How the scoping works

`window.EntAuth.scope()` returns `{ doctorId, seeAll }`:

* doctor → `doctorId = own id`, `seeAll = false`
* secretary → `doctorId = assigned_doctor_id`, `seeAll = false`
* admin → `seeAll = true`

`function/dbRecords.js` (Save to Database / cloud browser) and `function/syncEngine.js`
(background sync) both append `&doctor_id=eq.<doctorId>` to every read and write
`doctor_id` + `created_by` on every upsert, which uses
`on_conflict=clinic_id,doctor_id,record_key` so parallel doctors never overwrite
each other. Admins (and an unauthenticated preview with no session) keep the previous
clinic-wide behaviour.

### Live monitoring & audit

* `user_sessions` is heartbeat-updated every 5 minutes (and on tab focus / reconnect) —
  this powers **Admin → Overview / Active sessions**; an admin can revoke a session.
* `activity_logs` records LOGIN, LOGOUT, SAVE_RECORD, OPEN_RECORD, USER_CREATED,
  USER_UPDATED, USER_ACTIVATED, USER_DEACTIVATED, PASSWORD_RESET and SESSION_REVOKED —
  filterable under **Admin → Activity log**.

### Limitations to be aware of

* This is a **client-side** access layer on top of the public Supabase `anon` key (the
  app stays a static/offline PWA with no server). It stops accidental cross-doctor
  browsing and gives accountability, but it is not a replacement for Postgres Row Level
  Security with real Supabase Auth if you ever need protection against a determined user
  with the browser console.
* A revoked session stops appearing as "active" but the device keeps its cached
  credentials until it signs out or the user signs in again.
* Sign-in also works offline: after a successful online sign-in the user's salt/hash are
  cached on that device, so the same password is accepted with no connection (the chip
  shows a dashed border to mark the offline session).

## 🎨 Design

- Professional medical teal/blue color palette
- Clean, modern card-based layout
- Responsive design for mobile and tablet
- Dark mode support
- Sticky headers with auto-collapse on scroll

## 🛠️ Development

To run locally, simply open `index.html` in a browser, or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve
```

Then visit `http://localhost:8000`

## 📱 PWA Installation

The app is a Progressive Web App (PWA) and can be installed on:
- **Android**: Chrome menu → "Add to Home screen"
- **iOS**: Share button → "Add to Home Screen"
- **Desktop**: Install icon in browser address bar

## 📄 License

For internal clinic use only.