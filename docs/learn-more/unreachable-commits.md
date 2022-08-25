# Reachable and Unreachable Commits

In Git, every commit will have at least one parent commit except the very first. Additionally, a repository may have any number of branches that begin at any particular commit. Because of this we can create a graph of the history of a commit by following the path from one commit's parent to the another. Given a branch `development`, whose initial commit is `A`, and I add commit `B` and `C`. A resulting graph would be as follows:

```
development
C
|
B
|
A
```

Since we can follow the graph from `C` to `A`, that means that `A` is `reachable` by or from `C`. This as known as following the ancestral path of `C`.

Now, if we create a new branch called `feature-branch` from `C` and commit `D` and `E` and then return to `development` and commit `F`. We would have the resulting graph:
```
development
F
|  E
|  |  <-- feature-branch
|  D
| /
C
|
B
|
A
```

Here A is reachable by F through F, C, B, A and A is reachable by E through E, D, C, B, A. However, E, and D are not reachable by F. Thus, they are unreachable through their ancestral path.


Now, lets say we merge the `feature-branch` into our `development` branch. Our graph becomes:

G
| \
F  |
|  E
|  |
|  D
| /
C
|
B
|
A

Still E and D are unreachable by F. There are a few git commands that use the ancestral path to determine what to show. One of those is `git diff`. If you `git diff` two commits such as `git diff A..C`, you will receive the set of changes from commits if you traverse the graph from C to A. Thus, changes from A, B, C.

If you `git diff A..F`, you will likewise get changes from A,B,C,F.

In GitHub Desktop, this may feel confusing becuase Desktop displays the commits in chronological order. Thus, you will see a list that looks like a collapsed graph.

G
|
F
|
E
|
D
|
C
|
B
|
A

Thus, when you select F through A to see a diff of F to A, you may initially expect to see changes from E and D, but you won't because those changes are `unreachable` from F.



