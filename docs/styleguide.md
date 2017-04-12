# Typescript Style Guide

Most of our preferred style when writing typescript is configured in our [tslint.json](../tslint.json) file.

## Do
 - Use camelCase for methods
 - Use PascalCase for class names

# Documenting your code

We currently use [JSDoc](http://usejsdoc.org/) even though we don't currently generate any documentation or
verify the format. We're using JSDoc over other formats because the typescript compiler has built-in support
for parsing jsdoc and presenting it in IDEs.

While there doesn't appear to be any well-used typescript documentation export utilities out there at the
moment we hope that it's only a matter of time. JSDoc uses a lot of metadata that is already self-documented
in the typescript type system such as visibility, inheritance, membership.

For now all you need to know is that you can document classes, methods, properties and fields by using the
following formatted comment on the line above whatever you're trying to document.

```
/** This is a documentation string */
```

The double start `/**` opener is the key. It has to be exactly two stars for it to be a valid JSDoc open token.

If you need multiple lines to describe the subject try to sum up the thing you're describing in a short title
and leave a blank line before you go into detail, similar to a git commit message.

```
/**
 * This is a title, keep it short and sweet
 *
 * Go nuts with documentation here and in more paragraphs if you need to.
 */
```

