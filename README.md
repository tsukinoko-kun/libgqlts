# libgqlts

Type-safe GraphQL

Full example:

```typescript
import { Query, z } from "libgqlts";

const userIdQuery = Query.typed(
  "https://graphql.anilist.co", // api endpoint
  "AnimeList", // name of the query
  { // arguments (required when calling execute)
    userId: z.number().int().named("Int"),
    type: z.enum(["ANIME", "MANGA"]).named("MediaType"),
  },
  { // query schema
    MediaListCollection: {
      // _args is a special key that allows to add arguments to this part of the query
      _args: { userId: "$userId", type: "$type" },
      lists: [
        {
          entries: [
            {
              media: {
                title: {
                  english: z.string().nullable(),
                  romaji: z.string().nullable(),
                  native: z.string().nullable(),
                },
                isFavourite: z.boolean(),
                mediaListEntry: {
                  score: z.number(),
                  status: z.enum([
                    "CURRENT",
                    "PLANNING",
                    "COMPLETED",
                    "DROPPED",
                    "PAUSED",
                    "REPEATING",
                  ]),
                },
                bannerImage: z.string().nullable(),
                coverImage: {
                  color: z.string().nullable(),
                  medium: z.string().nullable(),
                },
              },
            },
          ],
        },
      ],
    },
    Viewer: {
      mediaListOptions: {
        scoreFormat: z.enum([
          "POINT_100",
          "POINT_10_DECIMAL",
          "POINT_10",
          "POINT_5",
          "POINT_3",
        ]),
      },
    },
  },
);

// `viewer` is fully type safe
// GraphQL errors reject the Promise from `execute`
const viewer = await userIdQuery.execute(
  {
    userId: 5812973,
    type: "ANIME",
  },
  "Bearer ey...bU",
);

console.log(
  viewer.MediaListCollection.lists[0]?.entries[0]?.media.title.english,
);
```
