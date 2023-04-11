export type BaseDomainEvent<Revision, Name, Data> = {
  revision: Revision;
  eventId: string;
  eventName: Name;
  eventCreatedAt: string;
  entityName: string;
  entityId: string;
  data: Data;
};
