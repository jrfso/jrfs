import { Maybe, Static, Type, define } from "jrfs/typebox";

export const DbModelMysql = Type.Object(
  {
    currency: Maybe(Type.String()),
  },
  define("DbModelMysql"),
);
export interface DbModelMysql extends Static<typeof DbModelMysql> {}
