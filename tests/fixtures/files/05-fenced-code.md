# Build notes

## Shell
```sh
# Not a heading: a shell comment
## Also not a heading
- not a list item
echo "done"
```

## Makefile
~~~make
build:
	go build ./...
~~~

## Python
    # indented code block, 4 spaces
    def main():
        print("hi")

## Indented list-like code

    - this is code, not a list
    - neither is this

## Nested fence in a list
- Step one
  ```js
  const x = 1;
  if (x) {
    console.log(x);
  }
  ```
- Step two
