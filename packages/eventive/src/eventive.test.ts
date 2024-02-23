import { last } from "lodash-es";
import type { Db } from "mongodb";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { eventive } from "./eventive";
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
      db,
      entityName: "MyEntity1",
      reducer,
      useSnapshot: true,
    });

    const currentDatetime = new Date().toISOString();

    const { entity: e0, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    expect(e0.state.createdDatetime).toEqual(currentDatetime);
    expect(e0.state.updatedDatetime).toEqual(currentDatetime);

    const e1 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e1).toBeNull();

    await commitCreate();

    const e2 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e2?.state.createdDatetime).toEqual(currentDatetime);
    expect(e2?.state.updatedDatetime).toEqual(currentDatetime);

    const allEntities = await myRepository.all();

    expect(allEntities.length).toEqual(1);
    expect(allEntities[0].state.createdDatetime).toEqual(currentDatetime);
    expect(allEntities[0].state.updatedDatetime).toEqual(currentDatetime);

    const batchedEntities = await myRepository.batchGet({
      entityIds: [e0.entityId],
    });

    expect(batchedEntities.length).toEqual(1);
    expect(batchedEntities[0].state.createdDatetime).toEqual(currentDatetime);
    expect(batchedEntities[0].state.updatedDatetime).toEqual(currentDatetime);
  });

  test("create entity with entityId", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity1",
      reducer,
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

    const e1 = await myRepository.findOne({
      entityId: "<entity-id>",
    });

    expect(e1?.entityId).toEqual("<entity-id>");

    const allEntities = await myRepository.all();

    expect(last(allEntities)?.entityId).toEqual("<entity-id>");

    const batchedEntities = await myRepository.batchGet({
      entityIds: ["<entity-id>"],
    });

    expect(batchedEntities.length).toEqual(1);
    expect(batchedEntities[0].entityId).toEqual("<entity-id>");
  });

  test("update entity", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
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

    expect(e0.state.createdDatetime).toEqual(currentDatetime);
    expect(e0.state.updatedDatetime).toEqual(currentDatetime);

    const e1 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e1).toBeNull();

    await commitCreate();

    const e2 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e2?.state.createdDatetime).toEqual(currentDatetime);
    expect(e2?.state.updatedDatetime).toEqual(currentDatetime);

    await delay(100);

    const updatedDatetime = new Date().toISOString();

    const { entity: e3, commit: commitUpdate } = myRepository.dispatch({
      entity: e2!,
      eventName: "update",
      eventBody: {
        datetime: updatedDatetime,
      },
    });

    expect(e3?.state.createdDatetime).toEqual(currentDatetime);
    expect(e3?.state.updatedDatetime).toEqual(updatedDatetime);

    const e4 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e4?.state.createdDatetime).toEqual(currentDatetime);
    expect(e4?.state.updatedDatetime).toEqual(currentDatetime);

    await commitUpdate();

    const e5 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e5?.state.createdDatetime).toEqual(currentDatetime);
    expect(e5?.state.updatedDatetime).toEqual(updatedDatetime);

    const limitedEvents = await myRepository.queryEvents({
      filter: {},
      limit: 1,
    });

    expect(limitedEvents.length).toEqual(1);
    expect(limitedEvents[0]).toStrictEqual(createEvent);
  });

  test("if it not committed, snapshot is empty", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
      useSnapshot: true,
    });

    const currentDatetime = new Date().toISOString();

    myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    const result = await myRepository.querySnapshots({
      filter: {
        "state.createdDatetime": currentDatetime,
      },
    });

    expect(result.length).toEqual(0);
  });

  test("if it committed, querySnapshot() returns [entity]", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
      useSnapshot: true,
    });

    const currentDatetime = new Date().toISOString();

    const { entity, commit } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    await commit();

    const result = await myRepository.querySnapshots({
      filter: {
        "state.createdDatetime": currentDatetime,
      },
    });

    expect(result.length).toEqual(1);
    expect(entity.entityId).toEqual(result[0].entityId);
  });

  test("if update event committed, can be queried with querySnapshot()", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
      useSnapshot: true,
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

    const result = await myRepository.querySnapshots({
      filter: {
        "state.updatedDatetime": secondDatetime,
      },
    });

    expect(result.length).toEqual(1);
    expect(entity.entityId).toEqual(result[0].entityId);
  });

  test("if multiple items have same state, querySnapshot() returns multiple items", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
      useSnapshot: true,
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

    const result = await myRepository.querySnapshots({
      filter: {
        "state.createdDatetime": currentDatetime,
      },
    });

    expect(result.length).toEqual(2);
    expect(entity1.entityId).toEqual(result[0].entityId);
    expect(entity2.entityId).toEqual(result[1].entityId);
  });

  test("if useSnapshot is not declared, querySnapshot() throw error", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
      useSnapshot: false,
    });

    const currentDatetime = new Date().toISOString();

    const { commit } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    await commit();

    await expect(
      myRepository.querySnapshots({
        filter: {
          "state.createdDatetime": currentDatetime,
        },
      })
    ).rejects.toThrow();
  });

  test("plugin interface: onCommitted", async () => {
    const onCommit = vi.fn(() => { });

    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
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
    const beforeCommitHook = vi.fn(() => { });

    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
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

  afterAll(async () => {
    await mongod.stop();
  });
});
