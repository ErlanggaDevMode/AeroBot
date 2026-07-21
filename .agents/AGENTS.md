# Workspace Rules: IoT Solar Outdoor Monitoring System

## Coding Guidelines (ponytail Ultra)
- **Extreme YAGNI (You Aren't Gonna Need It)**: Do not add unnecessary features, functions, or abstractions. Build only the minimum that works.
- **Minimize Code & Boilerplate**: Write compact, straightforward code. Avoid complex directory structures or verbose OOP abstractions unless explicitly required.
- **Native Platform Features**: Prefer standard/built-in Arduino/ESP32 features and libraries over third-party packages.
- **Ponytail Comments**: For deliberate simplifications that cut a real corner with a known ceiling, write a comment explaining the ceiling and the upgrade path.

## Development Constraints
- **Telegram Development Location**: All Telegram bot development and testing must be performed directly under `C:\T\AeroBot\TelegramBotTest/` using:
  - [TelegramBotTest.ino](file:///c:/T/AeroBot/TelegramBotTest/TelegramBotTest.ino)
  - [secrets.h](file:///c:/T/AeroBot/TelegramBotTest/secrets.h)
- Do not create a separate, complex project structure for simple bot test tasks unless explicitly asked to do so.
