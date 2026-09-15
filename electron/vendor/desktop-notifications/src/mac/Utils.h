#include <napi.h>
#import <Foundation/Foundation.h>

Napi::Value getNapiValueFromNSObject(const Napi::Env &env, id value);
id getNSObjectFromNapiValue(const Napi::Env &env, const Napi::Value &value);
