# Architecture Decision Records (ADRs)

Why this is shaped the way it is, decisions made while pulling two coupled modules out of the incident that produced both.

## The alert was confident about a cause nobody diagnosed

A sync daemon I ran had a catch-all that labeled every push failure the same way: a validation failure. The real cause, one time, was the backend having been administratively switched off. The alert said validation failure anyway, 324 times over about thirty hours, because the bare catch block that produced it had already thrown away the exception object that said the true cause in plain English.

That's two separate failures wearing one bug report. `classify-throw.ts` fixes the first: it matches a caught value against an ordered list of rules you supply, and if nothing matches, it reports `unclassified` through a fallback you also supply rather than guessing. Unclassified is an honest verdict. A wrong specific class looks like a working alert and sends the next person chasing the wrong cause, which is worse than admitting the tool doesn't know.

## Order is the whole point, because the causes overlap in the wild

A message about a disabled service can also contain the word "Error." A message about a rejected credential can be phrased by an intermediary as a server error. `classifyThrow` tries rules in the order given and returns the first match, so the shipped `exampleRules` list puts the more specific, more diagnostic causes first: service disabled, then unauthorized, then unreachable, then validation rejected, then generic server error last, as the catch-all a caller reaches only once nothing more specific fired.

Get the order backwards and a specific, actionable cause gets swallowed by a vaguer one that happened to match too, which is close in spirit to the original bug: a real cause existed and the alert named a different one instead.

## Exception text has one exit, and buildAlert isn't it

`localDetail` is the only function in either module that returns exception text, bounded by default to 400 characters with whitespace collapsed so one entry stays one line in whatever log it lands in. It exists because the daemon's real cause lived entirely in an exception string that a bare catch discarded before anything could read it. The fix isn't a better alert message; it's a place for that string to go that isn't the alert.

Nothing in the type system stops a caller from taking what `localDetail` returns and threading it into `buildAlert` anyway. The module can't enforce that separation once the string is in your hand; keeping it local is a discipline the caller has to keep, and the README says so rather than implying a guarantee that isn't there.

## An id gets checked twice, once alone and once assembled

`buildAlert` treats anything longer than 128 characters or containing whitespace as content wearing an id's clothes, and replaces it with a placeholder rather than printing it. A caller-supplied `contentGuard` can flag other shapes the same way, and it runs against each id individually and then again against the fully assembled line before that line goes out. Checking only the pieces would miss a leak that only exists once the pieces are joined with the lead sentence and the tag; checking the assembly catches that case, and if the assembled line still trips the guard, the function throws away everything it built and returns the smallest line it can, naming only the error class.

## The extraction changed the shape, not the behavior

What moved from the original to this package is structural: the closed error-class union, the lead sentences, and the tag are now supplied by the caller instead of hardcoded, and the private content-scanning import became the injectable `contentGuard`. The sources being ported were already the post-incident fixed versions, so there was nothing to repair here, only to generalize. Twenty-seven tests cover both modules, including one that plants a fake identifier and a fake exception message, shows what naive string interpolation would leak, and then shows the protected path doesn't.
