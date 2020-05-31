# @jtbennett/node-utils

A set of functions with minimal dependencies that are useful in node applications. These utilities are used in the other packages in this repo.

## base32Id

A base32Id is:

- A lowercase alphanumeric string
- Relatively short
- Monotonically increasing\*
- Effectively unique\*

_\* Unless you regularly generate multiple IDs per millisecond._

A base32Id values does not include the letters i, l, o and s, because they are easily mistaken for the numbers 0, 1, and 5.

When created with the `generateId()` function, a base32Id is 12 characters long. The first 8 characters represent the millisecond when the ID was generated. The last 4 characters represent a random number between 0 and 32^4-1 (~1 million). (Values will grow to 13 characters in the year 2050, and to 14 characters around the year 3131.)

Use base32Ids for any type of ID. Because they are nearly always monotonically increasing, they are appropriate for database keys. For example, as a clustered index value in Sql Server or as the `_id` value in MongoDB.

If your application regularly generates IDs multiple times in the same millisecond (including across multiple processes), you will likely see duplicate keys generated. You may need a different ID generation strategy in that case. Because there is a very small chance of duplication, your application should gracefully handle duplicate IDs.

The seed timestamp and number of random characters can be customized with the `createIdGenerator()` function.

## deepRemoveNulls

Removes all `null`-valued properties from an object, no matter how deeply nested.

Useful in graphql applications, where optional properties may be set to `null` by tools like apollo-server. That may cause Typescript type checks to fail against types where optional properties may be undefined, but never `null`.

## getLogSanitizer

Gets a function that removes sensitive values from an object, no matter how deeply nested.

By default, property names that include "key", "secret", "credential", "password", etc. have their values set to "XXXX". Property names that include "url" or "uri" and a value in the form "http://username:password@url" will have the password portion of the url set to "XXXX".

Useful for sanitizing objects being logged.

The keys that are sanitized are customizable.
