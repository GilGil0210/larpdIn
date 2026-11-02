# Larpdin

**Switch your professional persona with one click.**

Larpdin is a Chrome extension that allows users to experiment with different professional identities on LinkedIn. Powered by AI through Featherless, Larpdin scans your existing LinkedIn profile, generates alternative professional personas, and lets you switch between them.

Whether you want to explore being a software engineer, designer, entrepreneur, or another professional, Larpdin makes experimenting with your professional identity simple.

---

## ✨ Features

### 1. LinkedIn Profile Scanning
- Automatically scans the signed-in user's LinkedIn profile.
- Retrieves supported profile information, including headline, location, industry, About, and education.
- Saves an original profile snapshot for restoration.

### 2. AI Persona Generation
- Uses Featherless AI to generate three alternative professional personas.
- Users can describe the type of persona they want to create.
- Generates professional headlines, About descriptions, locations, industries, and education backgrounds.
- Supports fictional and alternative professional backgrounds.

### 3. Persona Customization
- Review generated personas before saving.
- Edit persona information to match your preferences.
- Save multiple personas locally for future use.

### 4. One-Click Persona Switching
- Apply a saved persona directly to your LinkedIn profile.
- Automatically updates supported profile sections.
- Displays progress while LinkedIn changes are being applied.
- Verifies saved information before confirming completion.

### 5. Profile Restoration
- Restore your original LinkedIn profile information.
- Undo your most recent persona switch.
- Captures updated profile information before switching to preserve manual changes.

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| TypeScript | Application logic and type safety |
| React | Extension user interface |
| Chrome Extension Manifest V3 | Browser extension architecture |
| Chrome Side Panel API | Main extension interface |
| Content Scripts | Interacting with LinkedIn profile forms |
| Node.js | Backend runtime |
| Featherless AI | AI-powered persona generation |
| Express | Backend API |
| Render | Backend deployment |
| Vitest | Unit and integration testing |
| Playwright | Browser automation and UI testing |

---

## 🏗️ System Architecture

Larpdin consists of three main components:

1. **Chrome Extension:** Scans LinkedIn profiles, manages personas, and interacts with LinkedIn's profile editing interface.
2. **Backend API:** Receives persona generation requests and communicates with Featherless AI.
3. **Featherless AI:** Generates three alternative professional personas based on the user's existing profile and persona description.

### Workflow

1. Open LinkedIn and launch Larpdin.
2. Scan your existing LinkedIn profile.
3. Describe the professional persona you want to explore.
4. Generate three AI-powered persona suggestions.
5. Review and customize the generated personas.
6. Save your preferred personas.
7. Switch between saved personas with one click.
8. Restore your original profile whenever needed.

---

## 🔄 Supported Profile Sections

| Profile Section | Supported |
|---|---|
| Headline | ✅ |
| Location | ✅ |
| Industry | ✅ |
| About / Summary / Bio | ✅ |
| Education | ✅ |
| Name | ❌ |
| Profile Photo | ❌ |
| Work Experience | ❌ |
| Skills | ❌ |
| Certifications | ❌ |
| Projects | ❌ |
| Volunteering | ❌ |

**Note:** The first release focuses on five profile sections. Other LinkedIn profile information remains unchanged.

---

## 🚀 Getting Started

### Prerequisites

- Node.js
- npm
- Google Chrome
- A Featherless API key
- A Render account for backend deployment

### 1. Clone the Repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd larpdin
```

### 2. Install Dependencies

Install the extension dependencies:

```bash
cd extension
npm install
```

Install the backend dependencies:

```bash
cd ../backend
npm install
```

### 3. Configure Environment Variables

Create a `.env` file inside the backend directory:

```env
PORT=3000
FEATHERLESS_API_KEY=your_featherless_api_key
FEATHERLESS_MODEL=Qwen/Qwen2.5-7B-Instruct
DEMO_ACCESS_TOKEN=your_demo_access_token
```

Never commit your actual API keys or access tokens to GitHub.

### 4. Start the Backend

```bash
cd backend
npm run dev
```

The backend health endpoint should be available at:

```text
http://localhost:3000/health
```

### 5. Build the Chrome Extension

```bash
cd extension
npm run build
```

### 6. Load the Extension into Chrome

1. Open Google Chrome.
2. Navigate to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extension's generated build directory.
6. Open LinkedIn and launch Larpdin through the Chrome extension.

---

## 🔐 Privacy and Security

- Profile information and saved personas are stored locally in the browser.
- No user accounts or database are required.
- Featherless API credentials remain on the backend.
- The extension uses a demo access token to communicate with the backend.
- Profile content, generated personas, and credentials should not be written to application logs.
- Persona switching requires access to the user's own LinkedIn profile.

---

## 🧪 Testing

Larpdin uses automated tests to verify core functionality.

**Vitest**
- Persona schema validation.
- Persona storage and persistence.
- Original profile snapshot restoration.
- Interrupted switching operations.

**Playwright**
- LinkedIn profile scanning.
- Location and industry autocomplete.
- Education section replacement.
- Error handling and recovery.

---

## ⚠️ Limitations

- Designed for English desktop LinkedIn.
- LinkedIn's interface may change, which can affect profile scanning and editing.
- LinkedIn updates are applied sequentially, not as one atomic operation.
- Switching may be interrupted if LinkedIn forms fail or the browser tab closes.
- Live LinkedIn functionality requires an authenticated LinkedIn session.
- Backend deployment requires a configured Render account and API credentials.

Larpdin is an experimental hackathon project. Users should ensure that any profile information they publish is accurate and complies with LinkedIn's User Agreement.

---

## 🔮 Future Improvements

- Support additional LinkedIn profile sections.
- Improve persona customization.
- Add more AI persona styles and career categories.
- Improve recovery from interrupted profile updates.
- Support additional languages.
- Explore additional professional networking platforms.

---

## 👥 Team

Built as a hackathon project.

**Project:** Larpdin  
**Category:** AI / Productivity / Chrome Extension  
**AI Provider:** Featherless

---

## 📄 License

This project is developed for educational and hackathon demonstration purposes.
