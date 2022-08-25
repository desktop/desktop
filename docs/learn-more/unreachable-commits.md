# Reachable and Unreachable Commits

In Git, every commit will have at least one parent commit except the very first. Additionally, a repository may have any number of branches that begin at any particular commit. Because of this we can create a graph of the history of a commit by following the path from one commit's parent to the another. Given a branch `development`, whose initial commit is `A`, and we add commit `B` and `C`. A resulting graph would be as follows:

```
development
C
|
B
|
A
```

Since we can follow the graph from `C` to `A`, that means that `A` is **reachable** by or from `C`. This as known as following the ancestral path of `C`.

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

In the above example, `B` is reachable by `F` through the ancestral path of `F`-> `C` -> `B`  and `B` is reachable by `E` through `E` -> `D` -> `C` -> `B`. However, there is no such path to get to `E` or `D` from `F`. Thus, `E` and `D` are **unreachable** from `F`.


Some git commands use the ancestral path to determine what to show. One of those is `git diff`, which is used to see the changes between two commits non inclusive of the first commit. If we execute `git diff A..C`, we will receive the set of changes from the commits if we were to traverse the ancestral path from `C` to `A` or `C` -> `B` -> `A`. Thus, we would see changes from `B` and `C`. Likewise, if we executed `git diff B..F`, you will get changes from reachable from `F`; thus, `F` -> `C` -> `B`. But, not changes from `E` and `D` as they are unreachable.

## Merge Commits
Now, lets say we merge the `feature-branch` into our `development` branch. Our graph becomes:
```
development
G
| \
F  |
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

Still `E` and `D` are unreachable by `F`. But, you may think "I merged the `feature-branch` into `development`, I should be able to see changes from `E` and `D`". This is true if you start at a commit that has them in it's ancestral path. That is `G` and it is known as a **merge commit** and it is special in that it has two parents. The first is `E` as the last commit of the branch being merged and `F` as the last commit of the branch being merged into. Now, all the commits in this graph are ancestors of `G`. Thus, if we were to execute `git diff B..G`. We will see changes of all ancestral paths of `G` to `A`. Those paths are `G` -> `F` -> `C` -> `B` and `G`-> `E` -> `D` -> `C` -> `B`. Therefore we will see changes from `G`, `F`, `E`, `D`, and `C`.

# GitHub Desktop
In GitHub Desktop diffing across multiple commits is accomplished through a range selection. This results in executing `git diff` from first to last commit in that selection. Therefore, generating diffs on a branches where multiple branches are merged may result in unreachable commits inside a diff selection. This is because the commits are displayed chronological order. Thus, the graph from the section `Merge Commits` from the previous section would look like:

[Image from Desktop Here]

Thus, when you select `F` through `A` to see a diff of `F` to `A` or `git diff A..F`, you may initially expect to see changes from `E` and `D`, but you won't because those changes are unreachable from `F`.





