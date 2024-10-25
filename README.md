# JRFS

**JSON + Resources File System library**

JRFS is a (transactional, queryable, collaborative, caching) file system with
customizable drivers, plugins, commands, file types and schemas.

## Current Status

_Alpha - Experimental - It works for local dev so far..._

This is a work in progress.

## Overview

Here's an overview of how the innards of this beast work.

```mermaid
flowchart TD;
    subgraph DI ["Driver"]
        direction LR;
        FSD("FsDriver");
        SQL("SQLite*");
        WBD("WebDriver");
    end
    subgraph FTS ["FileTree"]
        direction LR;
        FT("FileTree");
        WFT("WritableFileTree");
        WFT -->|writes| FT;
    end
    RO1("driver
        [fs, sqlite*, web]");
    RO2("FileTypeProvider
        [@jrfs/typebox, zod, ...]");
    RO3("plugins
        [diff, git, zip, ...]");
    RO{"_options_"} --> R;
    RO1 -->RO;
    RO2 -->RO;
    RO3 -->RO;
    R((("Repository"))) --> RC{"_creates_"};
    RC --> RCfg("RepositoryConfig");
    RC --> CmdReg("CommandsRegistry");
    RC --> DI;
    RC --> FT;
    RC --> PI("Plugins");
    DI --> |creates| WFT;

```

_[*] The SQLite driver does not yet exist, but the others do!_
