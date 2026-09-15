#import "Utils.h"

Napi::Object getNapiObjectFromDictionary(const Napi::Env &env, NSDictionary *d)
{
  Napi::Object obj = Napi::Object::New(env);
  for (NSString *key in d) {
    id value = d[key];
    obj.Set(Napi::String::New(env, key.UTF8String), getNapiValueFromNSObject(env, value));
  }
  return obj;
}

Napi::Array getNapiArrayFromArray(const Napi::Env &env, NSArray *a)
{
  Napi::Array result = Napi::Array::New(env);
  for (NSUInteger i = 0; i < a.count; i++) {
    id value = a[i];
    result.Set(i, getNapiValueFromNSObject(env, value));
  }
  return result;
}

Napi::Value getNapiValueFromNSObject(const Napi::Env &env, id value)
{
  if (value == nil)
  {
    return env.Undefined();
  }

  if ([value isKindOfClass:[NSString class]])
  {
    NSString *string = (NSString *)value;
    return Napi::String::New(env, string.UTF8String);
  }
  else if ([value isKindOfClass:[NSNumber class]])
  {
    NSNumber *number = value;

    // Booleans wrapped in NSNumber require special treatment
    CFTypeID boolID = CFBooleanGetTypeID(); // the type ID of CFBoolean
    CFTypeID numID = CFGetTypeID((__bridge CFTypeRef)(number)); // the type ID of number
    if (numID == boolID)
    {
      return Napi::Boolean::New(env, [number boolValue]);
    }

    CFNumberType numberType = CFNumberGetType((CFNumberRef)value);
    if (numberType == kCFNumberFloatType || numberType == kCFNumberDoubleType)
    {
      return Napi::Number::New(env, number.doubleValue);
    }
    else if (numberType == kCFNumberSInt64Type || numberType == kCFNumberLongLongType)
    {
      return Napi::Number::New(env, number.longLongValue);
    }
    else if (numberType == kCFNumberSInt32Type || numberType == kCFNumberIntType)
    {
      return Napi::Number::New(env, number.intValue);
    }
    else if (numberType == kCFNumberSInt16Type || numberType == kCFNumberShortType)
    {
      return Napi::Number::New(env, number.shortValue);
    }
    else if (numberType == kCFNumberSInt8Type || numberType == kCFNumberCharType)
    {
      return Napi::Number::New(env, number.charValue);
    }
    else if (numberType == kCFNumberCFIndexType || numberType == kCFNumberNSIntegerType)
    {
      return Napi::Number::New(env, number.integerValue);
    }
    else
    {
      return Napi::Number::New(env, number.longValue);
    }
  }
  else if ([value isKindOfClass:[NSDictionary class]])
  {
    return getNapiObjectFromDictionary(env, value);
  }
  else if ([value isKindOfClass:[NSArray class]])
  {
    return getNapiArrayFromArray(env, value);
  }

  return env.Undefined();
}

id getNSObjectFromNapiValue(const Napi::Env &env, const Napi::Value &value)
{
  if (value.IsString())
  {
    return [NSString stringWithUTF8String:value.As<Napi::String>().Utf8Value().c_str()];
  }
  else if (value.IsNumber())
  {
    return @(value.As<Napi::Number>().DoubleValue());
  }
  else if (value.IsBoolean())
  {
    return [NSNumber numberWithBool:value.As<Napi::Boolean>().Value()];
  }
  else if (value.IsNull())
  {
    return [NSNull null];
  }
  else if (value.IsObject())
  {
    Napi::Object obj = value.As<Napi::Object>();
    NSMutableDictionary *d = [NSMutableDictionary dictionary];
    for (auto it = obj.begin(); it != obj.end(); ++it) {
      auto entry = *it;
      NSString *key = [NSString stringWithUTF8String:entry.first.As<Napi::String>().Utf8Value().c_str()];
      d[key] = getNSObjectFromNapiValue(env, entry.second);
    }
    return d;
  }
  else if (value.IsArray())
  {
    Napi::Array arr = value.As<Napi::Array>();
    NSMutableArray *a = [NSMutableArray array];
    for (uint32_t i = 0; i < arr.Length(); i++) {
      a[i] = getNSObjectFromNapiValue(env, arr[i]);
    }
    return a;
  }

  return nil;
}
