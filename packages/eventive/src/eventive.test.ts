import type { Db } from "mongodb";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";
import { eventive } from "./eventive";
import { eventiveStorageMongo } from "./eventiveStorageMongo";
import type { BaseDomainEvent, BaseReducer } from "./util-types";

type MyDomainEvent =
  | BaseDomainEvent<"init", { datetime: string }>
  | BaseDomainEvent<"update", { datetime: string }>;

type MyState = {
  createdDatetime: string;
  updatedDatetime: string;
};

type MyReducer = BaseReducer<MyDomainEvent, MyState>;

const reducer: MyReducer = (prevState, event) => {
  switch (event.eventName) {
    case "init":
      return {
        createdDatetime: event.body.datetime,
        updatedDatetime: event.body.datetime,
      };
    case "update":
      return {
        ...prevState,
        updatedDatetime: event.body.datetime,
      };
  }
};

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

describe("eventive()", () => {
  let mongod: MongoMemoryServer;
  let db: Db;

  beforeAll(async () => {
    // This will create an new instance of "MongoMemoryServer" and automatically start it
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    const client = new MongoClient(uri);
    db = client.db("test");
  });

  test("create entity", async () => {
    const myRepository = eventive({
      entityName: "MyEntity1",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_one",
      }),
    });

    const currentDatetime = new Date().toISOString();

    const { entity: e0, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    expect(e0.createdDatetime).toEqual(currentDatetime);
    expect(e0.updatedDatetime).toEqual(currentDatetime);

    const e1 = await myRepository.findOneByEntityId({
      entityId: e0.entityId,
    });

    expect(e1).toBeNull();

    await commitCreate();

    const e2 = await myRepository.findOneByEntityId({
      entityId: e0.entityId,
    });

    expect(e2?.createdDatetime).toEqual(currentDatetime);
    expect(e2?.updatedDatetime).toEqual(currentDatetime);

    const batchedEntities = await myRepository.findByEntityIds({
      entityIds: [e0.entityId],
    });

    expect(batchedEntities.length).toEqual(1);
    expect(batchedEntities[0].createdDatetime).toEqual(currentDatetime);
    expect(batchedEntities[0].updatedDatetime).toEqual(currentDatetime);
  });

  test("create entity with entityId", async () => {
    const myRepository = eventive({
      entityName: "MyEntity1",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_one",
      }),
    });

    const currentDatetime = new Date().toISOString();

    const { entity: e0, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
      entityId: "<entity-id>",
    });

    expect(e0.entityId).toEqual("<entity-id>");

    await commitCreate();

    const e1 = await myRepository.findOneByEntityId({
      entityId: "<entity-id>",
    });

    expect(e1?.entityId).toEqual("<entity-id>");

    const batchedEntities = await myRepository.findByEntityIds({
      entityIds: ["<entity-id>"],
    });

    expect(batchedEntities.length).toEqual(1);
    expect(batchedEntities[0].entityId).toEqual("<entity-id>");
  });

  test("update entity", async () => {
    const myRepository = eventive({
      entityName: "MyEntity2",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_two",
      }),
    });

    const currentDatetime = new Date().toISOString();

    const {
      entity: e0,
      commit: commitCreate,
      event: createEvent,
    } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    expect(e0.createdDatetime).toEqual(currentDatetime);
    expect(e0.updatedDatetime).toEqual(currentDatetime);

    const e1 = await myRepository.findOneByEntityId({
      entityId: e0.entityId,
    });

    expect(e1).toBeNull();

    await commitCreate();

    const e2 = await myRepository.findOneByEntityId({
      entityId: e0.entityId,
    });

    expect(e2?.createdDatetime).toEqual(currentDatetime);
    expect(e2?.updatedDatetime).toEqual(currentDatetime);

    await delay(100);

    const updatedDatetime = new Date().toISOString();

    const { entity: e3, commit: commitUpdate } = myRepository.dispatch({
      entity: e2!,
      eventName: "update",
      eventBody: {
        datetime: updatedDatetime,
      },
    });

    expect(e3?.createdDatetime).toEqual(currentDatetime);
    expect(e3?.updatedDatetime).toEqual(updatedDatetime);

    const e4 = await myRepository.findOneByEntityId({
      entityId: e0.entityId,
    });

    expect(e4?.createdDatetime).toEqual(currentDatetime);
    expect(e4?.updatedDatetime).toEqual(currentDatetime);

    await commitUpdate();

    const e5 = await myRepository.findOneByEntityId({
      entityId: e0.entityId,
    });

    expect(e5?.createdDatetime).toEqual(currentDatetime);
    expect(e5?.updatedDatetime).toEqual(updatedDatetime);
  });

  test("if it not committed, snapshot is empty", async () => {
    const myRepository = eventive({
      entityName: "MyEntity2",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_two",
      }),
    });

    const currentDatetime = new Date().toISOString();

    myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    const result = await db
      .collection("my_entity_two")
      .find({
        createdDatetime: currentDatetime,
      })
      .toArray();

    expect(result.length).toEqual(0);
  });

  test("if it committed, querySnapshot() returns [entity]", async () => {
    const myRepository = eventive({
      entityName: "MyEntity2",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_two",
      }),
    });

    const currentDatetime = new Date().toISOString();

    const { entity, commit } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    await commit();

    const result = await db
      .collection("my_entity_two")
      .find({
        createdDatetime: currentDatetime,
      })
      .toArray();

    expect(result.length).toEqual(1);
    expect(entity.entityId).toEqual(result[0].entityId);
  });

  test("if update event committed, can be queried with querySnapshot()", async () => {
    const myRepository = eventive({
      entityName: "MyEntity2",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_two",
      }),
    });

    const firstDatetime = new Date().toISOString();

    const { entity, commit } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: firstDatetime,
      },
    });

    await commit();

    const secondDatetime = new Date().toISOString();

    const { commit: updateEntity } = myRepository.dispatch({
      entity,
      eventName: "update",
      eventBody: {
        datetime: secondDatetime,
      },
    });

    await updateEntity();

    const result = await db
      .collection("my_entity_two")
      .find({
        updatedDatetime: secondDatetime,
      })
      .toArray();

    expect(result.length).toEqual(1);
    expect(entity.entityId).toEqual(result[0].entityId);
  });

  test("if multiple items have same state, querySnapshot() returns multiple items", async () => {
    const myRepository = eventive({
      entityName: "MyEntity2",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_two",
      }),
    });

    const currentDatetime = new Date().toISOString();

    const { entity: entity1, commit: createEntity1 } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });
    const { entity: entity2, commit: createEntity2 } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    await createEntity1();
    await createEntity2();

    const result = await db
      .collection("my_entity_two")
      .find({
        createdDatetime: currentDatetime,
      })
      .toArray();

    expect(result.length).toEqual(2);
    expect(entity1.entityId).toEqual(result[0].entityId);
    expect(entity2.entityId).toEqual(result[1].entityId);
  });

  test("plugin interface: onCommitted", async () => {
    const onCommit = vi.fn(() => {});

    const myRepository = eventive({
      entityName: "MyEntity2",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_two",
      }),
      plugins: [
        {
          onCommitted() {
            onCommit();
          },
        },
      ],
    });

    const currentDatetime = new Date().toISOString();

    const { entity, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    expect(onCommit).toHaveBeenCalledTimes(0);

    await commitCreate();

    expect(onCommit).toHaveBeenCalledTimes(1);

    const { commit: commitUpdate } = myRepository.dispatch({
      entity,
      eventName: "update",
      eventBody: {
        datetime: new Date().toISOString(),
      },
    });

    expect(onCommit).toHaveBeenCalledTimes(1);

    await commitUpdate();

    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  test("plugin interface: beforeCommit", async () => {
    const beforeCommitHook = vi.fn(() => {});

    const myRepository = eventive({
      entityName: "MyEntity2",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_two",
      }),
      plugins: [
        {
          beforeCommit() {
            beforeCommitHook();
          },
        },
      ],
    });

    const currentDatetime = new Date().toISOString();

    const { entity, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    expect(beforeCommitHook).toHaveBeenCalledTimes(0);

    await commitCreate();

    expect(beforeCommitHook).toHaveBeenCalledTimes(1);

    const { commit: commitUpdate } = myRepository.dispatch({
      entity,
      eventName: "update",
      eventBody: {
        datetime: new Date().toISOString(),
      },
    });

    expect(beforeCommitHook).toHaveBeenCalledTimes(1);

    await commitUpdate();

    expect(beforeCommitHook).toHaveBeenCalledTimes(2);
  });

  test("batchGet return items sorted with input `entityIds` order", async () => {
    const myRepository = eventive({
      entityName: "MyEntity3",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_three",
      }),
    });

    const { entity: e1, commit: commit1 } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: new Date().toISOString(),
      },
    });

    await commit1();

    await delay(1);

    const { entity: e2, commit: commit2 } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: new Date().toISOString(),
      },
    });

    await commit2();

    const entities1 = await myRepository.findByEntityIds({
      entityIds: [e1.entityId, e2.entityId],
    });

    expect(entities1[0].entityId).toEqual(e1.entityId);
    expect(entities1[1].entityId).toEqual(e2.entityId);

    const entities2 = await myRepository.findByEntityIds({
      entityIds: [e2.entityId, e1.entityId],
    });

    expect(entities2[0].entityId).toEqual(e2.entityId);
    expect(entities2[1].entityId).toEqual(e1.entityId);
  });

  test("batchGet not include not found item in result array", async () => {
    const myRepository = eventive({
      entityName: "MyEntity4",
      reducer,
      storage: eventiveStorageMongo({
        db,
        eventsCollectionName: "events",
        snapshotsCollectionName: "my_entity_four",
      }),
    });

    const { entity: e1, commit: commit1 } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: new Date().toISOString(),
      },
    });
    const { entity: e2, commit: commit2 } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: new Date().toISOString(),
      },
    });

    await commit1();
    await commit2();

    const entities1 = await myRepository.findByEntityIds({
      entityIds: ["1234"],
    });

    expect(entities1.length).toEqual(0);

    const entities2 = await myRepository.findByEntityIds({
      entityIds: [e1.entityId, "<not-found>", e2.entityId],
    });

    expect(entities2[0].entityId).toEqual(e1.entityId);
    expect(entities2[1].entityId).toEqual(e2.entityId);
  });

  afterAll(async () => {
    await mongod.stop();
  });
});
