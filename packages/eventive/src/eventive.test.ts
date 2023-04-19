import type { Db } from "mongodb";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { eventive } from "./eventive";
import type { BaseDomainEvent, BaseReducer } from "./util-types";

type MyDomainEvent =
  | BaseDomainEvent<"v1", "init", { datetime: string }>
  | BaseDomainEvent<"v1", "update", { datetime: string }>;

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
      currentRevision: "v1",
      db,
      entityName: "MyEntity1",
      reducer,
      mapper: (e) => e,
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

  test("update entity", async () => {
    const myRepository = eventive({
      currentRevision: "v1",
      db,
      entityName: "MyEntity2",
      reducer,
      mapper: (e) => e,
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

  test("plugin interface", async () => {
    const onCommit = vi.fn(() => {});

    const myRepository = eventive({
      currentRevision: "v1",
      db,
      entityName: "MyEntity2",
      reducer,
      mapper: (e) => e,
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

  afterAll(async () => {
    await mongod.stop();
  });
});
