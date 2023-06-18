export type BaseDomainEvent<Name, Body> = {
  eventId: string;
  eventName: Name;
  eventCreatedAt: string;
  entityName: string;
  entityId: string;
  body: Body;
};
