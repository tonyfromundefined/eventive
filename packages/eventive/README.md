# Eventive

![](https://img.shields.io/npm/v/eventive) ![](https://img.shields.io/npm/l/eventive) ![](https://img.shields.io/npm/dt/eventive) ![](https://img.shields.io/github/contributors/tonyfromundefined/eventive) ![](https://img.shields.io/github/last-commit/tonyfromundefined/eventive)

Event Sourcing Framework in MongoDB

## Getting Started

```bash
$ yarn add mongodb eventive
```

## Setup

#### 1. Define Domain Model

```typescript
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
```

#### 2. Define my state

```typescript
type MyState = {
  // ...
};
```

#### 3. Implement my business logic clearly in reducer

```typescript
import { BaseReducer } from "eventive";

const reducer: BaseReducer<MyDomainEvent, MyState> = (prevState, event) => {
  // ...

  return nextState;
};
```

#### 4. Maps older revision events to newer event interfaces for backwards compatibility

```typescript
import { BaseMapper } from "eventive";

const mapper: BaseMapper<MyDomainEvent> = (event) => {
  // ...

  return currentRevisionEvent;
};
```

#### 5. Then, `eventive` automatically make common repository interface

```typescript
import { eventive } from "eventive";
import { MongoClient } from "mongodb";

const mongoClient = new MongoClient();
const db = mongoClient.db("my_database");

const myRepository = eventive({
  db,
  entityName: "MyModel",
  reducer,
  mapper,
  dbCollectionName: "events", // optional
});
```

## Usage

#### `all()`

```typescript
/**
 * Scan all entities
 */
myRepository.all();
```

#### `findOne()`

```typescript
/**
 * Find one entity with `entityId`
 */
myRepository.findOne({
  entityId: "...",
});
```

#### `batchGet()`

```typescript
/**
 * Find many entities with `entityIds`
 */
myRepository.batchGet({
  entityIds: ["...", "..."],
});
```

#### `create()`

```typescript
/**
 * Create entity with initial DomainEvent
 */
const { commit } = myRepository.create({
  eventName: "init",
  eventBody: {
    // ...
  },
});
```

#### `dispatch()`

```typescript
/**
 * Dispatch DomainEvent to entity
 */
const { commit } = myRepository.dispatch({
  entity,
  eventName: "edit",
  eventBody: {
    // ...
  },
});
```
