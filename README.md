# TODO (Sep 30 - Oct 1)
- Data format spec
    - JSON
    - Client -> Server
        - User login
        - Player actions
    - Server -> Client
        - Game start
            - Game ID
            - Players
            - Map (size, dirt, grass, hedge)
        - Turn
            - Game ID
            - Round #
            - Successful actions
            - All units with changed state
            - All regions with changed owners

- Server [?]
    - Has to be easy to run on player machine; Python?
    - Game logic
        - Round robin
        - Arbitrary number of teams :))
    - Host viewer

- Python client
    - Start game
    - Query game state
    - Send actions
    - Start server automatically?

- Javascript viewer
    - As simple as possible
    - Flat and pretty?

# TODO (after)
- User authentication
- Server 
    - Order-independent turn solver (c.f. Diplomacy)? Send state after every player?
    - Multiple games at once
- Backend
    - Sandboxing
    - Scrimmages
    - Tournament
- Client
    - Data upload
    - Authentication
    - Player profile picture?
    - Languages:
        - Java
        - Javascript?
        - Rust?
    - Language packages
- Website
    - Scrimmage viewer
    - Tournament viewer
    - Rankings
