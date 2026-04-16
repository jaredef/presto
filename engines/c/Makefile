CC = gcc
CFLAGS = -std=c17 -Wall -Wextra -O2 -D_GNU_SOURCE -Wno-format-truncation -Wno-unused-variable -Wno-unused-parameter -Wno-unused-function
LDFLAGS = -lsqlite3 -lmicrohttpd -lssl -lcrypto -lpcre2-8 -lm

.PHONY: all clean test run

all: presto-server presto-test

engine.o: engine.c engine.h
	$(CC) $(CFLAGS) -c engine.c -o engine.o

presto-server: main.c engine.o engine.h
	$(CC) $(CFLAGS) main.c engine.o -o presto-server $(LDFLAGS)

presto-test: test.c engine.o engine.h
	$(CC) $(CFLAGS) test.c engine.o -o presto-test $(LDFLAGS)

test: presto-test
	./presto-test

run: presto-server
	./presto-server

clean:
	rm -f presto-server presto-test engine.o presto.db
