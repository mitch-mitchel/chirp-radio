# CHIRP Radio - Remaining Tasks

## Waiting for External Dependencies

- **Android Auto** - Code complete, tested in emulator, needs physical device testing (see PLATFORM_INTEGRATION.md)
- **iOS Production CMS** - Needs CMS deployed, then update `VITE_CMS_API_URL` in `.env.production`

## Before Beta Work

### Frontend

- iPad responsive styling and layout optimization (app now supports iPhone + iPad)
- **CrCurrentDjCard Fallback Image** - Update hardcoded `localhost:3000` URL to use `VITE_CMS_API_URL` environment variable for production (src/stories/CrCurrentDjCard.tsx:30)
- **Neon Donations Integration** - Create new form in Neon that embeds into site or parallels CrDonation component for seamless UX
- **PayPal Store Integration** - Set up PayPal for store (currently nothing configured in PayPal for CHIRP)
- **Song Request API Integration** - MakeRequest.tsx UI complete, needs API endpoint connection (handleSubmit currently just logs to console)
- **Mobile CMS Integration** - Migrate remaining pages to use CMS content:
  - AccountSettings.tsx - No mobile CMS integration (still hardcoded)
  - NowPlaying.tsx - Minimal page with hardcoded header, no CMS integration
  - First Launch Welcome screen - Not implemented
  - Terms Acceptance flow - Not implemented
  - Global error message handler - Not implemented

### CMS (chirp-cms repo)

- **Recent Shows Automation** - Get the recent two shows automatically - emailed about getting dj named folders to pull from
- **Alt Text Generator** - Get alt tag generator working - CHIRP is ok with paying for this. Needs to create real, valid, contextual alt-tags

### Backend

- **Data Migration** - Pull in existing data and test - mobile and web exports
- **Collection Sync** - Combine users collections from mobile and web
- **Better Impact Import** - Import Better Impact and merge with listener accounts ONCE before launch

### General

- CMS features (audit logs, publishing workflow, content preview)
- Deployment documentation & infrastructure
- Integrations (analytics, HotJar, email)
- Full beta testing & documentation
- Production rollout

## Testing Checklist

### Android

- [ ] Lock screen media controls appear when playing
- [ ] Play/pause works from lock screen
- [ ] Metadata shows on lock screen
- [ ] Play/Pause in sync with media player

### Android Auto

- [ ] App works as expected
- [ ] Media Player works & artist content is there
- [ ] Play/Pause in sync with media player
- [ ] Play/Pause in sync with phone (and vice versa)

### iOS

- [ ] Lock screen media controls appear when playing
- [ ] Play/pause works from lock screen
- [ ] Metadata shows on lock screen
- [ ] Play/Pause in sync with media player

### CarPlay

- [ ] App works as expected
- [ ] Play/Pause in sync from phone to CarPlay (and vice versa)

### Apple Watch

- [ ] Media Player controls app
- [ ] Play/Pause in sync between devices

## Post-Launch Features

- Navigation control via CMS
- Collection grouping (folders/tags)
- Favorite DJ show start notification emails
