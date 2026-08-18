# Postman Collection Setup Guide

## Import the Collection

1. Open Postman
2. Click **Import** button (top left)
3. Select the `ADCC_API_Collection.postman_collection.json` file
4. The collection will be imported with all endpoints organized in folders

## Configuration

### Set Base URL

1. Click on the collection name: **ADCC API Collection**
2. Go to the **Variables** tab
3. Set the `baseUrl` variable:
   - **Local Development**: `http://localhost:3000`
   - **Render Deployment**: `https://your-app-name.onrender.com`
   - Or your custom domain if you have one

### Collection Variables

The collection has the following variables that are automatically managed:

- `baseUrl`: Base URL of your API (set manually)
- `accessToken`: Automatically set when you login/register/verify
- `refreshToken`: Automatically set when you login/register/verify

## Authentication Flow

### 1. Verify Firebase Auth (Login/Verify)

1. Go to **Authentication** → **Verify Firebase Auth**
2. Replace `YOUR_FIREBASE_ID_TOKEN_HERE` with your Firebase ID token
3. Send the request
4. The access token and refresh token will be automatically saved to collection variables

### 2. Register User (New Users Only)

1. First, call **Verify Firebase Auth** with a new user's Firebase token (you'll get `isNewUser: true`)
2. Use the temporary token from step 1 in the Authorization header
3. Go to **Authentication** → **Register User**
4. Fill in `fullName` and `gender` (Male/Female)
5. Send the request
6. New tokens will be automatically saved

### 3. Using Authenticated Endpoints

All endpoints that require authentication (marked with 🔒) will automatically use the `accessToken` variable. No need to manually copy tokens!

## Endpoints Overview

### Authentication
- ✅ **Verify Firebase Auth** (Public) - Login/verify user
- ✅ **Register User** (Protected) - Register new user
- ✅ **Refresh Access Token** (Public) - Refresh expired token
- ✅ **Logout** (Protected) - Logout and revoke token
- ✅ **Get Current User** (Protected) - Get user profile

### Events
- ✅ **Get All Events** (Public) - List events with filters
- ✅ **Get Event By ID** (Public) - Get single event
- 🔒 **Create Event** (Admin Only) - Create new event
- 🔒 **Update Event** (Admin Only) - Update event
- 🔒 **Delete Event** (Admin Only) - Delete event

### Community Rides
- ✅ **Get All Community Rides** (Public) - List rides with filters
- ✅ **Get Community Ride By ID** (Public) - Get single ride
- 🔒 **Create Community Ride** (Admin Only) - Create new ride
- 🔒 **Update Community Ride** (Admin Only) - Update ride
- 🔒 **Delete Community Ride** (Admin Only) - Delete ride

### Communities
- ✅ **Get All Communities** (Public) - List communities with filters (supports `isFeatured` query)
- ✅ **Get Featured Communities** (Public) - List only communities highlighted on homepage (query params optional)
- ✅ **Get Community By ID** (Public) - Get single community
- 🔒 **Create Community** (Admin Only) - Create new community
- 🔒 **Update Community** (Admin Only) - Update existing community
- 🔒 **Feature/Unfeature Community** (Admin Only) - Toggle homepage highlight flag
- 🔒 **Delete Community** (Admin Only) - Delete community
- 🔒 **Add/Remove Gallery Images** (Admin Only) - Manage community gallery
- ✅ **Get Community Gallery** (Public) - View community images
- other membership-related endpoints continue below (not shown here)
## Notes

- **Public endpoints** (✅): No authentication required
- **Protected endpoints** (🔒): Require authentication (Bearer token)
- **Admin only endpoints**: Require authentication + Admin role

## Testing Admin Endpoints

To test admin endpoints:
1. Login with an admin account using **Verify Firebase Auth**
2. The access token will be automatically saved
3. All admin endpoints will use this token automatically

## Tips

1. **Automatic Token Management**: The collection automatically saves and uses tokens, so you don't need to copy/paste them manually

2. **Query Parameters**: Enable/disable query parameters as needed in GET requests

3. **Path Variables**: Replace placeholder values like `EVENT_ID_HERE` with actual IDs from your database

4. **Image Fields**: For `mainImage`, `eventImage`, and `image` fields, you can use base64 encoded strings or leave them empty (optional fields)

5. **Date Formats**: Use ISO date strings like `"2025-02-15"` or full ISO format `"2025-02-15T06:00:00Z"`

6. **Status Values**: Use one of: `upcoming`, `ongoing`, `completed`, `cancelled`

7. **Gender Values**: Use either `Male` or `Female` (case-sensitive)

8. **Age Field**: Required integer between 0-150

## Troubleshooting

### 401 Unauthorized
- Make sure you've logged in and the access token is set
- Try refreshing the token using **Refresh Access Token**
- Check if your token has expired

### 403 Forbidden
- Make sure you're using an admin account for admin-only endpoints
- Verify your user role is "Admin"

### 404 Not Found
- Check your `baseUrl` variable is correct
- Verify the API is running and accessible
- Check the endpoint path matches your API version (default: v1)

### Invalid Token
- Get a new Firebase ID token from your frontend
- Re-run the **Verify Firebase Auth** endpoint

