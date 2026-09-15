# Smart Realty Room Scanner

Native iOS 16+ RoomPlan companion for the Smart Realty 3D builder. It scans one room on a LiDAR-equipped iPhone/iPad, processes the measured room with Apple's RoomPlan framework, and shares a local JSON export for **IMPORT LIDAR SCAN** on smartrealty.us.

The scan is not sent to Smart Realty or OpenAI. The user decides where to save or share the exported JSON.

## Run

1. Open `SmartRealtyScanner.xcodeproj` in Xcode.
2. Select a development team and a unique bundle identifier if required.
3. Connect a LiDAR-equipped iPhone or iPad running iOS 16 or later.
4. Build and run on the physical device. RoomPlan is unavailable in Simulator.
5. Scan one room, finish, and share the JSON to Files or another trusted destination.
6. Open the Smart Realty 3D builder and choose **IMPORT LIDAR SCAN**.

The app requests camera access only when RoomPlan starts. No third-party packages are used.
