# eventive

Event Sourcing Framework in MongoDB

## Usage

```typescript
import { eventive } from "eventive";
import { MongoClient } from "mongodb";

const mongoClient = new MongoClient();
const db = mongoClient.db("my_database");

/**
 * 1. Define your domain event
 */
type MyDomainEvent =
  | BaseDomainEvent<
      "init",
      {
        // ...
      }
    >
  | BaseDomainEvent<
      "update",
      {
        // ...
      }
    >;

/**
 * 2. Define your state
 */
type MyState = {
  // ...
};

/**
 * 3. Implement your own business logic clearly in reducer
 */
const reducer: BaseReducer<MyDomainEvent, MyState> = (prevState, event) => {
  // ...
};

/**
 * 4. Then, `eventive` automatically make common repository interface
 */
const repository = eventive({
  db,
  reducer,
  entityName: "MyModel",
});

// Scan all entities
repository.all();

// Find one entity with `entityId`
repository.findOne({
  entityId: "...",
});

// Find many entities with `entityIds`
repository.batch({
  entityIds: ["...", "..."],
});

// Create entity with initial DomainEvent
const { commit } = repository.create({
  eventName: "init",
  eventBody: {
    // ...
  },
});

// Dispatch DomainEvent to entity
const { commit } = repository.dispatch({
  entity,
  eventName: "edit",
  eventBody: {
    // ...
  },
});
```
